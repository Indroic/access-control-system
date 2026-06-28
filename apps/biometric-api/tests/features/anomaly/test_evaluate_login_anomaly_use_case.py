from datetime import datetime

from src.features.anomaly.application.dtos import EvaluateLoginAnomalyCommand
from src.features.anomaly.application.use_cases import EvaluateLoginAnomalyUseCase
from src.features.anomaly.domain.services import LoginTimePatternService

_MORNING_HOURS = [8.5, 8.7, 8.9, 9.0, 9.1, 9.2, 9.3, 8.8, 9.0, 9.1] * 2


def _dt(hour: float):
    h = int(hour)
    m = int(round((hour - h) * 60))
    return datetime(2026, 1, 1, h, m, 0)


class FakeHistoryReader:
    def __init__(self, hours):
        self._times = [_dt(h) for h in hours]
        self.calls = []

    async def get_login_times(self, user_id, since):
        self.calls.append((user_id, since))
        return list(self._times)


class FakeAuditLogger:
    def __init__(self):
        self.commands = []

    async def execute(self, command):
        self.commands.append(command)
        return None


async def test_suspicious_login_logs_audit_event():
    reader = FakeHistoryReader(_MORNING_HOURS)
    logger = FakeAuditLogger()
    use_case = EvaluateLoginAnomalyUseCase(
        pattern_service=LoginTimePatternService(),
        history_reader=reader,
        audit_logger=logger,
    )

    result = await use_case.execute(
        EvaluateLoginAnomalyCommand(
            user_id="u1",
            attempt_time=_dt(3.0),
            ip_address="10.0.0.1",
            user_agent="kiosk",
        )
    )

    assert result.is_suspicious is True
    assert len(logger.commands) == 1
    cmd = logger.commands[0]
    assert cmd.action == "biometric_suspicious_login"
    assert cmd.user_id == "u1"
    assert cmd.ip_address == "10.0.0.1"
    assert cmd.details["reason"] == "unusual_hour"
    assert cmd.details["sample_size"] == 20
    assert "score" in cmd.details and "mean_hour" in cmd.details


async def test_normal_login_does_not_log():
    reader = FakeHistoryReader(_MORNING_HOURS)
    logger = FakeAuditLogger()
    use_case = EvaluateLoginAnomalyUseCase(
        pattern_service=LoginTimePatternService(),
        history_reader=reader,
        audit_logger=logger,
    )

    result = await use_case.execute(
        EvaluateLoginAnomalyCommand(user_id="u1", attempt_time=_dt(9.1))
    )

    assert result.is_suspicious is False
    assert logger.commands == []


async def test_insufficient_history_does_not_log():
    reader = FakeHistoryReader([9.0] * 5)
    logger = FakeAuditLogger()
    use_case = EvaluateLoginAnomalyUseCase(
        pattern_service=LoginTimePatternService(),
        history_reader=reader,
        audit_logger=logger,
    )

    result = await use_case.execute(
        EvaluateLoginAnomalyCommand(user_id="u1", attempt_time=_dt(3.0))
    )

    assert result.is_suspicious is False
    assert logger.commands == []
