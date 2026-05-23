from typing import Any, Dict, Optional
from hexcore.application.dtos.base import DTO


class LogBiometricEventCommand(DTO):
    """Comando para registrar un evento de auditoría."""

    action: str
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = {}


class AuditLogResponse(DTO):
    """Respuesta del registro de auditoría."""

    id: str
    action: str
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = {}
