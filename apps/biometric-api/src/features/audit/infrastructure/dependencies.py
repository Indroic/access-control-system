from fastapi import Depends
from hexcore.infrastructure.uow import SqlAlchemyUnitOfWork
from hexcore.infrastructure.api.utils import get_sql_uow

from .repositories import BiometricAuditLogRepository
from ..application.use_cases import LogBiometricEventUseCase


async def make_audit_repository(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
) -> BiometricAuditLogRepository:
    return BiometricAuditLogRepository(uow)


async def get_audit_use_case(
    uow: SqlAlchemyUnitOfWork = Depends(get_sql_uow),
    repo: BiometricAuditLogRepository = Depends(make_audit_repository),
) -> LogBiometricEventUseCase:
    return LogBiometricEventUseCase(uow=uow, repo=repo)
