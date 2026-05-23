from hexcore.application.use_cases.base import UseCase
from hexcore.domain.uow import IUnitOfWork
from ..domain.entities import BiometricAuditLog
from ..domain.repositories import IBiometricAuditLogRepository
from .dtos import LogBiometricEventCommand, AuditLogResponse


class LogBiometricEventUseCase(UseCase[LogBiometricEventCommand, AuditLogResponse]):
    """Caso de uso para registrar eventos en la auditoría."""

    def __init__(self, repo: IBiometricAuditLogRepository, uow: IUnitOfWork):
        super().__init__()
        self.repo = repo
        self.uow = uow

    async def execute(self, command: LogBiometricEventCommand) -> AuditLogResponse:
        async with self.uow:
            entity = BiometricAuditLog(
                user_id=command.user_id,
                action=command.action,
                ip_address=command.ip_address,
                user_agent=command.user_agent,
                details=command.details,
            )
            await self.repo.save(entity)
            await self.uow.commit()

        return AuditLogResponse(
            id=str(entity.id),
            user_id=entity.user_id,
            action=entity.action,
            ip_address=entity.ip_address,
            user_agent=entity.user_agent,
            details=entity.details,
        )
