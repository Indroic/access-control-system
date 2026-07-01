from datetime import datetime

from src.features.anomaly.infrastructure.repositories import AuditLoginHistoryReader


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeExecResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalarResult(self._rows)


class _FakeSession:
    def __init__(self, rows):
        self._rows = rows
        self.executed = []

    async def execute(self, stmt):
        self.executed.append(stmt)
        return _FakeExecResult(self._rows)


async def test_returns_created_at_values():
    rows = [datetime(2026, 1, 1, 9, 0), datetime(2026, 1, 2, 9, 5)]
    session = _FakeSession(rows)
    reader = AuditLoginHistoryReader(session)

    result = await reader.get_login_times(
        "u1", since=datetime(2025, 1, 1), before=datetime(2030, 1, 1)
    )

    assert result == rows
    assert len(session.executed) == 1

    # El statement debe filtrar por usuario, acción y ventana temporal, y ordenar.
    compiled = str(session.executed[0]).lower()
    assert "user_id" in compiled
    assert "action" in compiled
    assert "created_at" in compiled
    assert "order by" in compiled


async def test_empty_history_returns_empty_list():
    session = _FakeSession([])
    reader = AuditLoginHistoryReader(session)

    result = await reader.get_login_times(
        "u1", since=datetime(2025, 1, 1), before=datetime(2030, 1, 1)
    )

    assert result == []
