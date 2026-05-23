from typing import List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status

from hexcore.infrastructure.uow import SqlAlchemyUnitOfWork
from hexcore.infrastructure.api.utils import get_sql_uow

from src.shared.infrastructure.auth.dependencies import (
    require_admin,
    verify_one_time_token,
    OneTimeTokenSession,
)

from ..domain.exceptions import FaceBiometricNotFound
from ..application.use_cases import (
    ExtractEncodingUseCase,
    RegisterBiometricsUseCase,
    RegisterBiometricsCommand,
    IdentifyUserCommand,
    IdentificationResponse,
    IdentifyUserUseCase,
    OpenDoorCommand,
    OpenDoorUseCase,
)
from ..infrastructure.repositories import UserFaceRepository

# Importaciones de Auditoría (HexCore)
from src.features.audit.infrastructure.repositories import BiometricAuditLogRepository
from src.features.audit.application.use_cases import LogBiometricEventUseCase
from src.features.audit.application.dtos import LogBiometricEventCommand

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


async def get_open_door_use_case() -> OpenDoorUseCase:
    """Instancia el caso de uso encargado de abrir la puerta."""
    return OpenDoorUseCase()


async def make_audit_repository(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
) -> BiometricAuditLogRepository:
    """Factory para crear una instancia del repositorio de auditoría."""
    return BiometricAuditLogRepository(uow)


async def get_audit_use_case(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
    repo: BiometricAuditLogRepository = Depends(make_audit_repository),
) -> LogBiometricEventUseCase:
    """Instancia el caso de uso de auditoría."""
    return LogBiometricEventUseCase(uow=uow, repo=repo)


# --- Endpoints ---


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_user_biometrics(
    user_id: str = Form(...),
    files: List[UploadFile] = File(...),
    use_case: RegisterBiometricsUseCase = Depends(get_register_use_case),
    audit_use_case: LogBiometricEventUseCase = Depends(get_audit_use_case),
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

    # Registrar acción de auditoría
    await audit_use_case.execute(
        LogBiometricEventCommand(
            action="biometrics_registered",
            user_id=user_id,
            details={
                "registered_by": getattr(user, "sub", str(user)),
                "samples_count": count,
            },
        )
    )

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
    audit_use_case: LogBiometricEventUseCase = Depends(get_audit_use_case),
):
    """
    Endpoint para identificar a un usuario a partir de una foto.
    Recibe una imagen y retorna el ID del usuario identificado o un error.
    """
    import time
    start_time = time.perf_counter()
    image_bytes = await file.read()
    command = IdentifyUserCommand(image_bytes=image_bytes)

    try:
        result = await use_case.execute(command)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        if result.match and result.user_id:
            # Loguear coincidencia exitosa
            await audit_use_case.execute(
                LogBiometricEventCommand(
                    action="biometric_match_success",
                    user_id=result.user_id,
                    details={
                        "latency_ms": latency_ms,
                        "match": True,
                        "message": result.message,
                    },
                )
            )
        else:
            # Loguear intento fallido (rostro no reconocido / threshold no alcanzado)
            await audit_use_case.execute(
                LogBiometricEventCommand(
                    action="biometric_match_failed",
                    details={
                        "latency_ms": latency_ms,
                        "match": False,
                        "reason": result.message
                        or "Threshold not met or face not registered",
                    },
                )
            )
        return result
    except HTTPException as e:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        await audit_use_case.execute(
            LogBiometricEventCommand(
                action="biometric_match_error",
                details={
                    "latency_ms": latency_ms,
                    "error_code": e.status_code,
                    "error_detail": e.detail,
                },
            )
        )
        raise e
    except FaceBiometricNotFound:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        await audit_use_case.execute(
            LogBiometricEventCommand(
                action="biometric_match_failed",
                details={
                    "latency_ms": latency_ms,
                    "match": False,
                    "reason": "Threshold not met or face not registered",
                },
            )
        )
        raise HTTPException(
            status_code=404, detail="No se encontró una coincidencia para la imagen"
        )
    except Exception as e:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        await audit_use_case.execute(
            LogBiometricEventCommand(
                action="biometric_match_error",
                details={
                    "latency_ms": latency_ms,
                    "error_message": str(e),
                },
            )
        )
        raise HTTPException(
            status_code=500, detail=f"Error técnico en la identificación: {str(e)}"
        )


@router.post("/hardware/open-door", status_code=status.HTTP_200_OK)
async def open_door(
    command: OpenDoorCommand,
    auth_session: OneTimeTokenSession = Depends(verify_one_time_token),
    use_case: OpenDoorUseCase = Depends(get_open_door_use_case),
    audit_use_case: LogBiometricEventUseCase = Depends(get_audit_use_case),
):
    """Endpoint para abrir una puerta mediante un relé protegido con OTT."""
    try:
        result = await use_case.execute(command)

        # Loguear apertura exitosa de la puerta
        await audit_use_case.execute(
            LogBiometricEventCommand(
                action="door_opened",
                user_id=auth_session.user_id,
                details={
                    "door_id": command.door_id or "default",
                    "reason": command.reason or "Facial biometric authentication access",
                    "status": result.status,
                    "message": result.message,
                },
            )
        )

        return {
            "status": result.status,
            "message": result.message,
            "authorized_user_id": auth_session.user_id,
        }
    except NotImplementedError as error:
        # Hardware aún no integrado: logueamos la apertura como exitosa pero con
        # un flag explícito para que el cliente pueda mostrar el aviso al operador.
        await audit_use_case.execute(
            LogBiometricEventCommand(
                action="door_opened",
                user_id=auth_session.user_id,
                details={
                    "door_id": command.door_id or "default",
                    "reason": command.reason or "Facial biometric authentication access",
                    "status": "hardware_pending",
                    "message": str(error),
                },
            )
        )
        return {
            "status": "hardware_pending",
            "message": str(error),
            "authorized_user_id": auth_session.user_id,
        }

