from abc import ABC, abstractmethod
from datetime import datetime

from src.features.audit.application.dtos import LogBiometricEventCommand


class ILoginHistoryReader(ABC):
    """Puerto: lee las marcas de tiempo de logins concedidos de un usuario."""

    @abstractmethod
    async def get_login_times(self, user_id: str, since: datetime) -> list[datetime]:
        raise NotImplementedError


class IAuditEventLogger(ABC):
    """Puerto: registra un evento de auditoría."""

    @abstractmethod
    async def execute(self, command: LogBiometricEventCommand) -> object:
        raise NotImplementedError
