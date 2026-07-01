from dataclasses import dataclass


@dataclass(frozen=True)
class AnomalyConfig:
    """Parámetros de la detección de anomalía horaria."""

    min_samples: int = 20
    k: float = 2.0
    min_r: float = 0.35


@dataclass(frozen=True)
class AnomalyResult:
    """Resultado de evaluar si una hora de login es anómala."""

    is_suspicious: bool
    score: float
    mean_hour: float
    sigma_hours: float
    resultant_r: float
    sample_size: int
    reason: str
