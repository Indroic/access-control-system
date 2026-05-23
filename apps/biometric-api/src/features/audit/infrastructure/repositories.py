from hexcore.infrastructure.repositories.implementations import (
    SQLAlchemyCommonImplementationsRepo,
)
from ..domain.entities import BiometricAuditLog
from ..domain.exceptions import AuditLogNotFound
from ..domain.repositories import IBiometricAuditLogRepository
from .models import BiometricAuditLogModel


class BiometricAuditLogRepository(
    SQLAlchemyCommonImplementationsRepo[BiometricAuditLog, BiometricAuditLogModel],
    IBiometricAuditLogRepository,
):
    """Repositorio concreto de auditoría biométrica."""

    @property
    def entity_cls(self):
        return BiometricAuditLog

    @property
    def model_cls(self):
        return BiometricAuditLogModel

    @property
    def not_found_exception(self):
        return AuditLogNotFound
