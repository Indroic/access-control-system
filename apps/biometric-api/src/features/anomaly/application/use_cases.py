from datetime import timedelta

from hexcore.application.use_cases.base import UseCase

from src.features.audit.application.dtos import LogBiometricEventCommand

from ..domain.ports import IAdminNotifier, IAuditEventLogger, ILoginHistoryReader
from ..domain.services import LoginTimePatternService
from ..domain.value_objects import AnomalyResult
from .dtos import EvaluateLoginAnomalyCommand, NotifySuspiciousLoginCommand


def _to_decimal_hour(dt) -> float:
	return dt.hour + dt.minute / 60.0 + dt.second / 3600.0


class EvaluateLoginAnomalyUseCase(UseCase[EvaluateLoginAnomalyCommand, AnomalyResult]):
	"""Evalúa la hora de un login y registra auditoría si es sospechoso."""

	def __init__(
		self,
		pattern_service: LoginTimePatternService,
		history_reader: ILoginHistoryReader,
		audit_logger: IAuditEventLogger,
		notifier: IAdminNotifier | None = None,
		history_days: int = 90,
	) -> None:
		super().__init__()
		self._pattern_service = pattern_service
		self._history_reader = history_reader
		self._audit_logger = audit_logger
		self._notifier = notifier
		self._history_days = history_days

	async def execute(self, command: EvaluateLoginAnomalyCommand) -> AnomalyResult:
		since = command.attempt_time - timedelta(days=self._history_days)
		history = await self._history_reader.get_login_times(
			command.user_id, since, command.attempt_time
		)
		history_hours = [_to_decimal_hour(dt) for dt in history]
		attempt_hour = _to_decimal_hour(command.attempt_time)

		result = self._pattern_service.evaluate(history_hours, attempt_hour)

		if result.is_suspicious:
			await self._audit_logger.execute(
				LogBiometricEventCommand(
					action="biometric_suspicious_login",
					user_id=command.user_id,
					ip_address=command.ip_address,
					user_agent=command.user_agent,
					details={
						"score": result.score,
						"reason": result.reason,
						"mean_hour": result.mean_hour,
						"sigma_hours": result.sigma_hours,
						"resultant_r": result.resultant_r,
						"sample_size": result.sample_size,
						"login_hour": attempt_hour,
					},
				)
			)
			if self._notifier is not None:
				await self._notifier.execute(
					NotifySuspiciousLoginCommand(
						user_id=command.user_id,
						ip_address=command.ip_address,
						user_agent=command.user_agent,
						score=result.score,
						reason=result.reason,
						login_hour=attempt_hour,
						occurred_at=command.attempt_time,
					)
				)

		return result
