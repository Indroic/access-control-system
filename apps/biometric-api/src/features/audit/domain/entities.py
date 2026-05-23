from typing import Any, Dict, Optional
from hexcore.domain.base import BaseEntity


class BiometricAuditLog(BaseEntity):
    """
    Entidad de dominio que representa un registro de auditoría de biometría.
    BaseEntity ya provee: id, created_at, updated_at, is_active.
    """

    user_id: Optional[str] = None
    action: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Dict[str, Any] = {}
