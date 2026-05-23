import io
import cv2
import numpy as np
from PIL import Image
from collections.abc import Sequence
from typing import List, Optional
from fastapi import HTTPException

# --- INSIGHTFACE IMPORTS ---
from insightface.app import FaceAnalysis

# --- IMPORT REGISTRY (HexCore Source of Truth) ---
from hexcore.application.use_cases.base import UseCase
from hexcore.application.dtos.base import DTO
from hexcore.domain.uow import IUnitOfWork

# Importaciones locales del dominio
from ..domain.entities import FaceBiometric
from ..domain.repositories import IUserFaceRepository


# =========================================================================
# 0. AI ENGINE WRAPPER (Singleton-like for Performance)
# =========================================================================


class FaceEngine:
    """
    Encapsula el modelo InsightFace.
    Se recomienda inicializar esto una sola vez al arrancar la app.
    """

    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            # 'buffalo_l' es el modelo más preciso.
            # 'providers' define dónde corre (CPU o CUDA)
            cls._instance = FaceAnalysis(
                name="buffalo_l", providers=["CPUExecutionProvider"]
            )
            # det_size define la resolución de entrada para la detección
            cls._instance.prepare(ctx_id=0, det_size=(640, 640))
        return cls._instance


# =========================================================================
# 1. DATA TRANSFER OBJECTS (DTOs)
# =========================================================================


class ExtractEncodingCommand(DTO):
    """Comando para solicitar la extracción de un vector desde una imagen binaria."""

    image_bytes: bytes


class RegisterBiometricsCommand(DTO):
    """Comando para registrar múltiples muestras de un usuario de Better Auth."""

    user_id: str
    images: List[bytes]


class IdentifyUserCommand(DTO):
    """Comando para buscar la identidad de un usuario a partir de una imagen."""

    image_bytes: bytes
    threshold: float = 0.45


class IdentificationResponse(DTO):
    """Respuesta estructurada del proceso de identificación 1:N."""

    user_id: Optional[str] = None
    match: bool = False
    message: str = ""


class WarmupCommand(DTO):
    """Comando para forzar la descarga e inicializacion de los modelos de IA."""

    pass


class OpenDoorCommand(DTO):
    """Comando para abrir una puerta mediante relé."""

    door_id: str | None = None
    reason: str | None = None


class OpenDoorResponse(DTO):
    """Respuesta estructurada para la acción open-door."""

    status: str
    message: str


# =========================================================================
# 2. CASOS DE USO (BUSINESS LOGIC)
# =========================================================================


class WarmupBiometricsUseCase(UseCase[WarmupCommand, str]):
    """
    Caso de Uso: Inicializacion (Warmup).
    Fuerza al motor a descargar los modelos y cargarlos en RAM.
    Util para ejecutar en el evento 'startup' de la API.
    """

    async def execute(self, command: WarmupCommand) -> str:
        try:
            # Al obtener la instancia por primera vez, se disparan las descargas de ONNX
            FaceEngine.get_instance()
            return "Motor de biometria inicializado y modelos listos en memoria."
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Fallo critico al inicializar el motor de IA: {str(e)}",
            )


class ExtractEncodingUseCase(UseCase[ExtractEncodingCommand, Sequence[float]]):
    """
    Caso de Uso: Extraer Encoding (InsightFace version).
    Convierte una imagen en un embedding de 512 dimensiones usando ArcFace.
    """

    async def execute(self, command: ExtractEncodingCommand) -> Sequence[float]:
        try:
            # 1. Convertir bytes a imagen de OpenCV (BGR)
            # Usamos PIL para garantizar compatibilidad con formatos variados y luego convertimos
            img_pil = Image.open(io.BytesIO(command.image_bytes)).convert("RGB")
            img_np = np.array(img_pil)

            # InsightFace/OpenCV usan BGR internamente para muchos modelos
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            # 2. Procesar con el motor de IA
            engine = FaceEngine.get_instance()
            faces = engine.get(img_bgr)

            if not faces:
                raise HTTPException(
                    status_code=400,
                    detail="No se detectó ningún rostro. Asegúrese de que la cara sea visible y esté iluminada.",
                )

            # 3. Extraer el embedding normalizado (512-D)
            # Tomamos la cara con mayor puntaje de detección (usualmente la principal)
            face = sorted(faces, key=lambda x: x.det_score, reverse=True)[0]

            # El normed_embedding es ideal para comparaciones de similitud de coseno
            return face.normed_embedding.tolist()

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Error en el motor InsightFace: {str(e)}"
            )


class RegisterBiometricsUseCase(UseCase[RegisterBiometricsCommand, int]):
    """
    Caso de Uso: Registrar Biometría.
    Extrae vectores de 512-D y los persiste de forma atómica.
    """

    def __init__(self, repo: IUserFaceRepository, uow: IUnitOfWork):
        super().__init__()
        self.repo = repo
        self.uow = uow

    async def execute(self, command: RegisterBiometricsCommand) -> int:
        extractor = ExtractEncodingUseCase()
        count = 0

        async with self.uow:
            for img_bytes in command.images:
                vector = await extractor.execute(
                    ExtractEncodingCommand(image_bytes=img_bytes)
                )

                entity = FaceBiometric(user_id=command.user_id, embedding=vector)

                await self.repo.save(entity)
                count += 1

            await self.uow.commit()

        return count


class IdentifyUserUseCase(UseCase[IdentifyUserCommand, IdentificationResponse]):
    """
    Caso de Uso: Identificar Usuario.
    Búsqueda 1:N en base de datos vectorial utilizando embeddings de 512-D.
    """

    def __init__(self, repo: IUserFaceRepository):
        super().__init__()
        self.repo = repo

    async def execute(self, command: IdentifyUserCommand) -> IdentificationResponse:
        extractor = ExtractEncodingUseCase()
        vector = await extractor.execute(
            ExtractEncodingCommand(image_bytes=command.image_bytes)
        )

        # Nota: Asegúrate de que el repo use Similitud de Coseno o Distancia Euclidiana
        # ajustada para vectores de 512 dimensiones.
        match_result = await self.repo.get_by_vector(vector, threshold=command.threshold)

        if not match_result:
            return IdentificationResponse(
                match=False,
                message="No se encontró ningún usuario que coincida con esta biometría.",
            )

        return IdentificationResponse(
            user_id=match_result.user_id,
            match=True,
            message="Usuario identificado correctamente.",
        )


def _open_door_relay(command: OpenDoorCommand) -> OpenDoorResponse:
    raise NotImplementedError("open-door hardware integration is not implemented yet")


class OpenDoorUseCase(UseCase[OpenDoorCommand, OpenDoorResponse]):
    """Caso de uso para abrir una puerta mediante relé."""

    async def execute(self, command: OpenDoorCommand) -> OpenDoorResponse:
        return _open_door_relay(command)
