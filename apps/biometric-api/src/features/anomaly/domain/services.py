import math
from collections.abc import Sequence

from hexcore.domain.services import BaseDomainService

from .value_objects import AnomalyConfig, AnomalyResult

_TWO_PI = 2.0 * math.pi
_HOURS = 24.0
# Evita división por cero en el z-score cuando R→1 (patrón perfectamente concentrado → sigma→0).
_SIGMA_FLOOR = 1e-6


def _hour_to_angle(hour: float) -> float:
    return (hour % _HOURS) / _HOURS * _TWO_PI


class LoginTimePatternService(BaseDomainService):
    """Detecta horas de login anómalas mediante estadística circular (von Mises)."""

    def __init__(self, config: AnomalyConfig | None = None) -> None:
        self._config = config or AnomalyConfig()
        super().__init__()

    def evaluate(
        self, history_hours: Sequence[float], attempt_hour: float
    ) -> AnomalyResult:
        n = len(history_hours)
        if n < self._config.min_samples:
            return AnomalyResult(
                is_suspicious=False,
                score=0.0,
                mean_hour=0.0,
                sigma_hours=0.0,
                resultant_r=0.0,
                sample_size=n,
                reason="insufficient_history",
            )

        angles = [_hour_to_angle(h) for h in history_hours]
        c = sum(math.cos(a) for a in angles) / n
        s = sum(math.sin(a) for a in angles) / n
        r = math.hypot(c, s)
        mean_angle = math.atan2(s, c) % _TWO_PI
        mean_hour = mean_angle / _TWO_PI * _HOURS

        if r < self._config.min_r:
            return AnomalyResult(
                is_suspicious=False,
                score=0.0,
                mean_hour=mean_hour,
                sigma_hours=0.0,
                resultant_r=r,
                sample_size=n,
                reason="no_consistent_pattern",
            )

        sigma = max(math.sqrt(-2.0 * math.log(r)), _SIGMA_FLOOR)
        sigma_hours = sigma / _TWO_PI * _HOURS

        attempt_angle = _hour_to_angle(attempt_hour)
        diff = math.atan2(
            math.sin(attempt_angle - mean_angle),
            math.cos(attempt_angle - mean_angle),
        )
        z = abs(diff) / sigma
        is_suspicious = z > self._config.k

        return AnomalyResult(
            is_suspicious=is_suspicious,
            score=z,
            mean_hour=mean_hour,
            sigma_hours=sigma_hours,
            resultant_r=r,
            sample_size=n,
            reason="unusual_hour" if is_suspicious else "within_normal_hours",
        )
