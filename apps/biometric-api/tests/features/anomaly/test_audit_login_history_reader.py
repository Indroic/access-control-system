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


class FakeSession:
    def __init__(self, rows):
        self._rows = rows
        self.executed = []

    async def execute(self, stmt):
        self.executed.append(stmt)
        return _FakeExecResult(self._rows)


async def test_returns_created_at_values():
    rows = [datetime(2026, 1, 1, 9, 0), datetime(2026, 1, 2, 9, 5)]
    session = FakeSession(rows)
    reader = AuditLoginHistoryReader(session)

    result = await reader.get_login_times("u1", since=datetime(2025, 1, 1))

    assert result == rows
    assert len(session.executed) == 1


async def test_empty_history_returns_empty_list():
    session = FakeSession([])
    reader = AuditLoginHistoryReader(session)

    result = await reader.get_login_times("u1", since=datetime(2025, 1, 1))

    assert result == []
