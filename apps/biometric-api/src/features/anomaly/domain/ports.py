from abc import ABC, abstractmethod
from datetime import datetime


class ILoginHistoryReader(ABC):
    """Puerto: lee las marcas de tiempo de logins concedidos de un usuario."""

    @abstractmethod
    async def get_login_times(
        self, user_id: str, since: datetime, before: datetime
    ) -> list[datetime]:
        raise NotImplementedError


class IAuditEventLogger(ABC):
    """Puerto: registra un evento de auditoría."""

    @abstractmethod
    async def execute(self, command: object) -> object:
        raise NotImplementedError


class IAdminNotifier(ABC):
    """Puerto: notifica (push) a los administradores sobre un login sospechoso."""

    @abstractmethod
    async def execute(self, command: object) -> None:
        raise NotImplementedError
