from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from config import config

from ..application.dtos import LogBiometricEventCommand, AuditLogResponse
from ..application.use_cases import LogBiometricEventUseCase
from ..domain.entities import BiometricAuditLog
from .dependencies import get_audit_use_case, make_audit_repository
from hexcore.infrastructure.api.utils import build_query_endpoint
from hexcore.application.use_cases.query import QueryEntitiesUseCase
from .repositories import BiometricAuditLogRepository

router = APIRouter(prefix="/audit", tags=["Audit"])

_bearer = HTTPBearer(auto_error=False)


def _require_internal_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    if credentials is None or credentials.credentials != config.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


class LoginEventRequest(BaseModel):
    action: str
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = {}


@router.post(
    "/login-event",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_require_internal_key)],
)
async def log_login_event(
    payload: LoginEventRequest,
    audit_use_case: LogBiometricEventUseCase = Depends(get_audit_use_case),
):
    """
    Registra eventos de autenticación web (éxito o intento fallido).
    Protegido con INTERNAL_API_KEY — solo para uso interno servidor-a-servidor.
    """
    await audit_use_case.execute(
        LogBiometricEventCommand(
            action=payload.action,
            user_id=payload.user_id,
            ip_address=payload.ip_address,
            user_agent=payload.user_agent,
            details=payload.details,
        )
    )
    return {"status": "logged"}


def get_query_audit_use_case(
    repo: BiometricAuditLogRepository = Depends(make_audit_repository)
) -> QueryEntitiesUseCase:
    return QueryEntitiesUseCase(repository=repo)


router.add_api_route(
    path="",
    endpoint=build_query_endpoint(use_case_factory=get_query_audit_use_case),
    methods=["GET"],
    dependencies=[Depends(_require_internal_key)],
)
