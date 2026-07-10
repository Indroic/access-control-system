from datetime import datetime, timezone

import httpx
import pytest

from src.features.anomaly.application.dtos import NotifySuspiciousLoginCommand
from src.features.anomaly.infrastructure.notifiers import HttpAdminNotifier


class _FakeResponse:
	def raise_for_status(self) -> None:
		return None


class _FakeAsyncClient:
	instances: list["_FakeAsyncClient"] = []

	def __init__(self, *args, **kwargs) -> None:
		self.calls: list[dict] = []
		_FakeAsyncClient.instances.append(self)

	async def __aenter__(self) -> "_FakeAsyncClient":
		return self

	async def __aexit__(self, *exc) -> bool:
		return False

	async def post(self, url, headers=None, json=None):
		self.calls.append({"url": url, "headers": headers, "json": json})
		return _FakeResponse()


class _FailingAsyncClient(_FakeAsyncClient):
	async def post(self, *args, **kwargs):
		raise httpx.ConnectError("boom")


@pytest.fixture(autouse=True)
def _reset_fake_client():
	_FakeAsyncClient.instances.clear()
	yield


def _patch_config(monkeypatch):
	monkeypatch.setattr(
		"src.features.anomaly.infrastructure.notifiers.config.server_internal_url",
		"http://server:3000",
	)
	monkeypatch.setattr(
		"src.features.anomaly.infrastructure.notifiers.config.internal_api_key",
		"secret-key",
	)


async def test_sends_expected_payload(monkeypatch):
	monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
	_patch_config(monkeypatch)

	notifier = HttpAdminNotifier()
	await notifier.execute(
		NotifySuspiciousLoginCommand(
			user_id="u1",
			ip_address="10.0.0.1",
			user_agent="kiosk",
			score=3.2,
			reason="unusual_hour",
			login_hour=3.0,
			occurred_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
		)
	)

	assert len(_FakeAsyncClient.instances) == 1
	call = _FakeAsyncClient.instances[0].calls[0]
	assert call["url"] == "http://server:3000/api/internal/notifications/suspicious-login"
	assert call["headers"] == {"x-internal-api-key": "secret-key"}
	assert call["json"]["userId"] == "u1"
	assert call["json"]["ip"] == "10.0.0.1"
	assert call["json"]["loginHour"] == 3.0
	assert call["json"]["occurredAt"] == "2026-01-01T03:00:00+00:00"


async def test_swallows_network_errors(monkeypatch):
	monkeypatch.setattr(httpx, "AsyncClient", _FailingAsyncClient)
	_patch_config(monkeypatch)

	notifier = HttpAdminNotifier()
	# No debe propagar la excepción — solo loguear.
	await notifier.execute(
		NotifySuspiciousLoginCommand(
			user_id="u1",
			score=3.2,
			reason="unusual_hour",
			login_hour=3.0,
			occurred_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
		)
	)
