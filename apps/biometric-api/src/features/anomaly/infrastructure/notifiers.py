import logging
import traceback

import httpx

from config import config

from ..application.dtos import NotifySuspiciousLoginCommand
from ..domain.ports import IAdminNotifier

logger = logging.getLogger("anomaly")


class HttpAdminNotifier(IAdminNotifier):
	"""POST interno al servidor Hono. Nunca propaga errores — el push es best-effort."""

	async def execute(self, command: NotifySuspiciousLoginCommand) -> None:
		try:
			async with httpx.AsyncClient(timeout=3.0) as client:
				await client.post(
					f"{config.server_internal_url}/api/internal/notifications/suspicious-login",
					headers={"x-internal-api-key": config.internal_api_key},
					json={
						"userId": command.user_id,
						"ip": command.ip_address,
						"userAgent": command.user_agent,
						"score": command.score,
						"reason": command.reason,
						"loginHour": command.login_hour,
						"occurredAt": command.occurred_at.isoformat(),
					},
				)
		except Exception:  # noqa: BLE001 — la notificación jamás debe afectar el login
			logger.warning(
				"Fallo al notificar login sospechoso:\n%s", traceback.format_exc()
			)
