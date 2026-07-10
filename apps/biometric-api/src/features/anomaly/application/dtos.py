from datetime import datetime

from hexcore.application.dtos.base import DTO


class EvaluateLoginAnomalyCommand(DTO):
    """Comando para evaluar la anomalía horaria de un login biométrico."""

    user_id: str
    attempt_time: datetime
    ip_address: str | None = None
    user_agent: str | None = None


class NotifySuspiciousLoginCommand(DTO):
    """Comando para notificar (push) un login biométrico sospechoso."""

    user_id: str
    ip_address: str | None = None
    user_agent: str | None = None
    score: float
    reason: str
    login_hour: float
    occurred_at: datetime
