from src.features.anomaly.domain.services import LoginTimePatternService
from src.features.anomaly.domain.value_objects import AnomalyConfig, AnomalyResult

# Patrón matutino concentrado (~9:00), 20 muestras.
MORNING = [8.5, 8.7, 8.9, 9.0, 9.1, 9.2, 9.3, 8.8, 9.0, 9.1] * 2
# Patrón centrado en medianoche (cruza 23↔0), 20 muestras.
MIDNIGHT = [23.5, 23.8, 0.2, 0.5, 23.9, 0.1, 0.0, 23.7, 0.3, 23.6] * 2
# Patrón disperso: una muestra por hora => sin concentración.
DISPERSED = [float(h) for h in range(24)]


def test_insufficient_history_is_not_suspicious():
    svc = LoginTimePatternService()
    result = svc.evaluate([9.0] * 5, attempt_hour=3.0)
    assert isinstance(result, AnomalyResult)
    assert result.is_suspicious is False
    assert result.reason == "insufficient_history"
    assert result.sample_size == 5


def test_normal_hour_within_pattern_is_not_suspicious():
    svc = LoginTimePatternService()
    result = svc.evaluate(MORNING, attempt_hour=9.2)
    assert result.is_suspicious is False
    assert result.reason == "within_normal_hours"
    assert 8.5 <= result.mean_hour <= 9.5


def test_clear_outlier_is_suspicious():
    svc = LoginTimePatternService()
    result = svc.evaluate(MORNING, attempt_hour=3.0)
    assert result.is_suspicious is True
    assert result.reason == "unusual_hour"
    assert result.score > 2.0


def test_midnight_wraparound_near_mean_is_not_suspicious():
    svc = LoginTimePatternService()
    result = svc.evaluate(MIDNIGHT, attempt_hour=0.2)
    assert result.is_suspicious is False


def test_midnight_wraparound_far_is_suspicious():
    svc = LoginTimePatternService()
    result = svc.evaluate(MIDNIGHT, attempt_hour=12.0)
    assert result.is_suspicious is True


def test_dispersed_pattern_does_not_flag():
    svc = LoginTimePatternService()
    result = svc.evaluate(DISPERSED, attempt_hour=3.0)
    assert result.is_suspicious is False
    assert result.reason == "no_consistent_pattern"


def test_custom_config_threshold():
    # Con k muy alto, ni un outlier claro se marca.
    svc = LoginTimePatternService(AnomalyConfig(min_samples=20, k=100.0, min_r=0.35))
    result = svc.evaluate(MORNING, attempt_hour=3.0)
    assert result.is_suspicious is False
