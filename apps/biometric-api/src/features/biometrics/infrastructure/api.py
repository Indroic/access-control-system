from typing import List
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status

from hexcore.infrastructure.uow import SqlAlchemyUnitOfWork
from hexcore.infrastructure.api.utils import get_sql_uow

from src.shared.infrastructure.auth.dependencies import (
    require_admin,
    verify_one_time_token,
    OneTimeTokenSession,
    CurrentUser,
)

from ..domain.exceptions import FaceBiometricNotFound
from ..application.use_cases import (
    RegisterBiometricsUseCase,
    RegisterBiometricsCommand,
    IdentifyUserCommand,
    IdentificationResponse,
    IdentifyUserUseCase,
    OpenDoorCommand,
    OpenDoorUseCase,
)
from ..infrastructure.repositories import UserFaceRepository
from src.features.audit.infrastructure.decorators import audit_endpoint

router = APIRouter(prefix="/biometrics", tags=["Biometrics"])


# --- Dependencias de Casos de Uso ---


async def make_user_face_repository(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
) -> UserFaceRepository:
    return UserFaceRepository(uow)


async def get_register_use_case(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
    repo: UserFaceRepository = Depends(make_user_face_repository),
) -> RegisterBiometricsUseCase:
    return RegisterBiometricsUseCase(uow=uow, repo=repo)


async def get_identify_use_case(
    repo: UserFaceRepository = Depends(make_user_face_repository),
) -> IdentifyUserUseCase:
    return IdentifyUserUseCase(repo=repo)


async def get_open_door_use_case() -> OpenDoorUseCase:
    return OpenDoorUseCase()


# --- Endpoints ---


@router.post("/register", status_code=status.HTTP_201_CREATED)
@audit_endpoint(
    action="biometrics_registered",
    details_on_success=lambda result, user_id, **kw: {
        "registered_for_user": user_id,
        "samples_count": result.get("count"),
    },
    details_on_failure=lambda exc, user_id, **kw: {
        "registered_for_user": user_id,
        "error": str(exc),
    },
)
async def register_user_biometrics(
    user_id: str = Form(...),
    files: List[UploadFile] = File(...),
    use_case: RegisterBiometricsUseCase = Depends(get_register_use_case),
    user: CurrentUser = Depends(require_admin),
):
    """
    Registra la biometría de un empleado.
    Recibe el ID generado por Better Auth y una lista de imágenes.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Se requiere al menos una imagen")

    image_list = [await f.read() for f in files]
    count = await use_case.execute(RegisterBiometricsCommand(user_id=user_id, images=image_list))

    return {
        "status": "success",
        "message": f"Se han registrado {count} vectores para el usuario {user_id}",
        "count": count,
    }


@router.post(
    "/identify", response_model=IdentificationResponse, status_code=status.HTTP_200_OK
)
@audit_endpoint(
    action="biometric_identify",
    result_to_action=lambda result: (
        "biometric_access_granted" if result.match else "biometric_access_denied"
    ),
    details_on_success=lambda result, **kw: {
        "match": result.match,
        "user_id_matched": result.user_id,
        "message": result.message,
    },
    details_on_failure=lambda exc, **kw: {
        "reason": "face_not_found"
        if isinstance(exc, FaceBiometricNotFound)
        else "technical_error",
        "error": str(exc),
    },
)
async def identify_user(
    file: UploadFile = File(...),
    use_case: IdentifyUserUseCase = Depends(get_identify_use_case),
):
    """
    Identifica a un usuario a partir de una foto.
    Retorna el ID del usuario si hay coincidencia, o acceso denegado en caso contrario.
    """
    image_bytes = await file.read()
    return await use_case.execute(IdentifyUserCommand(image_bytes=image_bytes))


@router.post("/hardware/open-door", status_code=status.HTTP_200_OK)
@audit_endpoint(
    action="door_opened",
    result_to_action=lambda result: (
        "door_open_hardware_pending"
        if result.get("status") == "hardware_pending"
        else "door_opened"
    ),
    details_on_success=lambda result, command, auth_session, **kw: {
        "door_id": command.door_id or "default",
        "reason": command.reason or "Facial biometric authentication access",
        "status": result.get("status"),
        "message": result.get("message"),
    },
    details_on_failure=lambda exc, command, **kw: {
        "door_id": command.door_id or "default",
        "error": str(exc),
    },
)
async def open_door(
    command: OpenDoorCommand,
    auth_session: OneTimeTokenSession = Depends(verify_one_time_token),
    use_case: OpenDoorUseCase = Depends(get_open_door_use_case),
):
    """Abre una puerta mediante relé protegido con OTT."""
    try:
        result = await use_case.execute(command)
        return {
            "status": result.status,
            "message": result.message,
            "authorized_user_id": auth_session.user_id,
        }
    except NotImplementedError as error:
        # Hardware aún no integrado: retornamos 200 con flag explícito para
        # que el cliente pueda mostrar el aviso al operador.
        return {
            "status": "hardware_pending",
            "message": str(error),
            "authorized_user_id": auth_session.user_id,
        }
