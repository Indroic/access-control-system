from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.audit.infrastructure.models import BiometricAuditLogModel

from ..domain.ports import ILoginHistoryReader

_GRANTED_ACTION = "biometric_access_granted"


class AuditLoginHistoryReader(ILoginHistoryReader):
    """Lee horas de accesos concedidos desde la tabla biometric_audit_log."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_login_times(self, user_id: str, since: datetime) -> list[datetime]:
        stmt = (
            select(BiometricAuditLogModel.created_at)
            .where(BiometricAuditLogModel.user_id == user_id)
            .where(BiometricAuditLogModel.action == _GRANTED_ACTION)
            .where(BiometricAuditLogModel.created_at >= since)
            .order_by(BiometricAuditLogModel.created_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
