from typing import List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status

from hexcore.infrastructure.uow import SqlAlchemyUnitOfWork
from hexcore.infrastructure.api.utils import get_sql_uow

from src.shared.infrastructure.auth.dependencies import require_admin

from ..domain.exceptions import FaceBiometricNotFound
from ..application.use_cases import (
    ExtractEncodingUseCase,
    RegisterBiometricsUseCase,
    RegisterBiometricsCommand,
    IdentifyUserCommand,
    IdentificationResponse,
    IdentifyUserUseCase,
)
from ..infrastructure.repositories import UserFaceRepository

# Definición del Router para el slice de Biometría
router = APIRouter(prefix="/biometrics", tags=["Biometrics"])

# --- Dependencias de Casos de Uso ---


async def get_extract_use_case() -> ExtractEncodingUseCase:
    """Instancia el caso de uso de extracción de vectores."""
    return ExtractEncodingUseCase()


async def make_user_face_repository(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
) -> UserFaceRepository:
    """Factory para crear una instancia del repositorio de biometría."""
    return UserFaceRepository(uow)


async def get_register_use_case(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
    repo: UserFaceRepository = Depends(make_user_face_repository),
) -> RegisterBiometricsUseCase:
    """
    Instancia el caso de uso de registro inyectando el UoW
    y la factory del repositorio.
    """
    return RegisterBiometricsUseCase(uow=uow, repo=repo)


async def get_identify_use_case(
    repo: UserFaceRepository = Depends(make_user_face_repository),
) -> IdentifyUserUseCase:
    """
    Instancia el caso de uso de identificación inyectando el UoW
    y la factory del repositorio.
    """
    return IdentifyUserUseCase(repo=repo)


# --- Endpoints ---


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user_biometrics(
    user_id: str = Form(...),
    files: List[UploadFile] = File(...),
    use_case: RegisterBiometricsUseCase = Depends(get_register_use_case),
    user: str = Depends(require_admin),
):
    """
    Endpoint para registrar la biometría de un nuevo empleado.
    Recibe el ID generado por Better Auth y una lista de imágenes.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Se requiere al menos una imagen")

    image_list = [await f.read() for f in files]
    command = RegisterBiometricsCommand(user_id=user_id, images=image_list)

    count = await use_case.execute(command)
    return {
        "status": "success",
        "message": f"Se han registrado {count} vectores para el usuario {user_id}",
        "count": count,
    }


@router.post(
    "/identify", response_model=IdentificationResponse, status_code=status.HTTP_200_OK
)
async def identify_user(
    file: UploadFile = File(...),
    use_case: IdentifyUserUseCase = Depends(get_identify_use_case),
):
    """
    Endpoint para identificar a un usuario a partir de una foto.
    Recibe una imagen y retorna el ID del usuario identificado o un error.
    """
    image_bytes = await file.read()
    command = IdentifyUserCommand(image_bytes=image_bytes)

    try:
        result = await use_case.execute(command)
        return result
    except HTTPException as e:
        raise e
    except FaceBiometricNotFound:
        raise HTTPException(
            status_code=404, detail="No se encontró una coincidencia para la imagen"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error técnico en la identificación: {str(e)}"
        )
