# Detección de logins biométricos sospechosos — Fase 1 (Detección + auditoría) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un login biométrico en una hora inusual para el usuario quede detectado (estadística circular von Mises) y registrado como evento de auditoría `biometric_suspicious_login`, sin bloquear ni ralentizar el login.

**Architecture:** Nuevo vertical-slice `src/features/anomaly` en el servicio Python (HexCore). Un domain service puro (`LoginTimePatternService`) calcula la anomalía; un use case (`EvaluateLoginAnomalyUseCase`) orquesta lectura de historial (puerto `ILoginHistoryReader`, adaptador sobre `biometric_audit_log`) + registro de auditoría (reusa `LogBiometricEventUseCase`). El endpoint `/v1/biometrics/identify` recibe un campo `purpose`; cuando vale `login` y hubo match, encola la detección en un `BackgroundTask` con su propia sesión, envuelto en `try/except` para no afectar el login. El plugin Better-Auth envía `purpose=login` solo en `authenticate-face`.

**Tech Stack:** Python 3.14, uv, FastAPI, HexCore 2.0.x, SQLAlchemy async, pytest + pytest-asyncio (nuevas dev-deps). TypeScript/Biome para el cambio del plugin.

## Global Constraints

- **Python:** `requires-python >=3.14`; el proyecto se ejecuta con `uv` (usar `uv run …`).
- **HexCore (capas):** el dominio NO importa de aplicación/infraestructura. Las entidades extienden `BaseEntity` (ya provee `id`, `created_at`, `updated_at`, `is_active` — no redeclarar). Escrituras dentro de `async with uow:`; el `commit()` del UoW despacha eventos (no llamar `dispatch_events()` a mano). No reimplementar `get_by_id/list_all/save/delete` en repos.
- **El login nunca se bloquea ni se ralentiza:** toda la detección corre en un `BackgroundTask` posterior a la respuesta, envuelto en `try/except`. Un fallo se loguea, nunca propaga.
- **DTOs:** comandos/respuestas de aplicación extienden `DTO` de `hexcore.application.dtos.base`.
- **Action de auditoría exacto:** `biometric_suspicious_login` (string literal, sin variaciones).
- **TS:** Biome (tabs, comillas dobles). Correr `pnpm check` antes de commitear el cambio del plugin.
- **Tabla reutilizada:** los eventos sospechosos se escriben en `biometric_audit_log` (no se crea tabla ni migración nueva en Fase 1).

---

## File Structure (Fase 1)

- `apps/biometric-api/pyproject.toml` — **Modify:** añadir dev-deps (`pytest`, `pytest-asyncio`) y config de pytest.
- `apps/biometric-api/src/features/anomaly/__init__.py` — **Create** (vacío).
- `apps/biometric-api/src/features/anomaly/domain/__init__.py` — **Create** (vacío).
- `apps/biometric-api/src/features/anomaly/domain/value_objects.py` — **Create:** `AnomalyConfig`, `AnomalyResult`.
- `apps/biometric-api/src/features/anomaly/domain/services.py` — **Create:** `LoginTimePatternService` (lógica pura).
- `apps/biometric-api/src/features/anomaly/domain/ports.py` — **Create:** `ILoginHistoryReader`, `IAuditEventLogger`.
- `apps/biometric-api/src/features/anomaly/application/__init__.py` — **Create** (vacío).
- `apps/biometric-api/src/features/anomaly/application/dtos.py` — **Create:** `EvaluateLoginAnomalyCommand`.
- `apps/biometric-api/src/features/anomaly/application/use_cases.py` — **Create:** `EvaluateLoginAnomalyUseCase`.
- `apps/biometric-api/src/features/anomaly/infrastructure/__init__.py` — **Create** (vacío).
- `apps/biometric-api/src/features/anomaly/infrastructure/repositories.py` — **Create:** `AuditLoginHistoryReader`.
- `apps/biometric-api/src/features/anomaly/infrastructure/tasks.py` — **Create:** `run_login_anomaly_detection`, `should_run_login_detection`.
- `apps/biometric-api/src/features/biometrics/infrastructure/api.py` — **Modify:** `purpose` + `BackgroundTasks` + `request` en `identify_user`.
- `apps/biometric-api/config.py` — **Modify:** parámetros `anomaly_*`.
- `apps/biometric-api/.env.example` y `.env.example` raíz — **Modify:** documentar vars nuevas.
- `apps/biometric-api/tests/features/anomaly/__init__.py` — **Create** (vacío).
- `apps/biometric-api/tests/features/anomaly/test_login_time_pattern_service.py` — **Create.**
- `apps/biometric-api/tests/features/anomaly/test_evaluate_login_anomaly_use_case.py` — **Create.**
- `apps/biometric-api/tests/features/anomaly/test_audit_login_history_reader.py` — **Create.**
- `apps/biometric-api/tests/features/anomaly/test_should_run_login_detection.py` — **Create.**
- `packages/auth/src/plugins/biometric.ts` — **Modify:** enviar `purpose=login` en `authenticateFaceHandler`.

> Todos los comandos `uv run …` / `pytest` se ejecutan desde `apps/biometric-api/`.

---

### Task 1: Domain — `LoginTimePatternService` (lógica pura, von Mises) + value objects + setup de tests

**Files:**
- Modify: `apps/biometric-api/pyproject.toml`
- Create: `apps/biometric-api/src/features/anomaly/__init__.py`, `apps/biometric-api/src/features/anomaly/domain/__init__.py`
- Create: `apps/biometric-api/src/features/anomaly/domain/value_objects.py`
- Create: `apps/biometric-api/src/features/anomaly/domain/services.py`
- Create: `apps/biometric-api/tests/features/anomaly/__init__.py`
- Test: `apps/biometric-api/tests/features/anomaly/test_login_time_pattern_service.py`

**Interfaces:**
- Produces:
  - `AnomalyConfig(min_samples: int = 20, k: float = 2.0, min_r: float = 0.35)` — dataclass `frozen`.
  - `AnomalyResult(is_suspicious: bool, score: float, mean_hour: float, sigma_hours: float, resultant_r: float, sample_size: int, reason: str)` — dataclass `frozen`.
  - `LoginTimePatternService(config: AnomalyConfig | None = None)` con `def evaluate(self, history_hours: Sequence[float], attempt_hour: float) -> AnomalyResult`.

- [ ] **Step 1: Añadir dev-deps y config de pytest**

En `apps/biometric-api/pyproject.toml`, tras el bloque `[tool.uv.sources]`, añadir:

```toml
[dependency-groups]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
```

Instalar:

```bash
cd apps/biometric-api && uv sync --group dev
```

Expected: instala pytest y pytest-asyncio sin error.

- [ ] **Step 2: Escribir los tests (que fallarán)**

Crear `apps/biometric-api/tests/features/anomaly/__init__.py` vacío y `apps/biometric-api/tests/features/anomaly/test_login_time_pattern_service.py`:

```python
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
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_login_time_pattern_service.py -v`
Expected: FAIL (ModuleNotFoundError: `src.features.anomaly.domain.services`).

- [ ] **Step 4: Implementar los value objects**

Crear `apps/biometric-api/src/features/anomaly/__init__.py` y `apps/biometric-api/src/features/anomaly/domain/__init__.py` vacíos. Crear `apps/biometric-api/src/features/anomaly/domain/value_objects.py`:

```python
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
```

- [ ] **Step 5: Implementar el domain service**

Crear `apps/biometric-api/src/features/anomaly/domain/services.py`:

```python
import math
from collections.abc import Sequence

from hexcore.domain.services import BaseDomainService

from .value_objects import AnomalyConfig, AnomalyResult

_TWO_PI = 2.0 * math.pi
_HOURS = 24.0
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
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_login_time_pattern_service.py -v`
Expected: PASS (7 passed).

- [ ] **Step 7: Commit**

```bash
git add apps/biometric-api/pyproject.toml apps/biometric-api/uv.lock apps/biometric-api/src/features/anomaly apps/biometric-api/tests/features/anomaly
git commit -m "feat(anomaly): domain service de detección horaria (von Mises) + tests"
```

---

### Task 2: Puertos + DTO + `EvaluateLoginAnomalyUseCase` (con fakes)

**Files:**
- Create: `apps/biometric-api/src/features/anomaly/domain/ports.py`
- Create: `apps/biometric-api/src/features/anomaly/application/__init__.py`
- Create: `apps/biometric-api/src/features/anomaly/application/dtos.py`
- Create: `apps/biometric-api/src/features/anomaly/application/use_cases.py`
- Test: `apps/biometric-api/tests/features/anomaly/test_evaluate_login_anomaly_use_case.py`

**Interfaces:**
- Consumes: `LoginTimePatternService`, `AnomalyResult` (Task 1); `LogBiometricEventCommand` de `src.features.audit.application.dtos`.
- Produces:
  - `ILoginHistoryReader` — `async def get_login_times(self, user_id: str, since: datetime) -> list[datetime]`.
  - `IAuditEventLogger` — `async def execute(self, command: LogBiometricEventCommand) -> object`.
  - `EvaluateLoginAnomalyCommand(DTO)` — `user_id: str`, `attempt_time: datetime`, `ip_address: str | None = None`, `user_agent: str | None = None`.
  - `EvaluateLoginAnomalyUseCase(pattern_service, history_reader, audit_logger, history_days: int = 90)` con `async def execute(self, command: EvaluateLoginAnomalyCommand) -> AnomalyResult`. Si `result.is_suspicious`, registra un `LogBiometricEventCommand(action="biometric_suspicious_login", …)`.

- [ ] **Step 1: Escribir el test (que fallará)**

Crear `apps/biometric-api/tests/features/anomaly/test_evaluate_login_anomaly_use_case.py`:

```python
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_evaluate_login_anomaly_use_case.py -v`
Expected: FAIL (ModuleNotFoundError: `src.features.anomaly.application.dtos`).

- [ ] **Step 3: Implementar los puertos**

Crear `apps/biometric-api/src/features/anomaly/domain/ports.py`:

```python
from abc import ABC, abstractmethod
from datetime import datetime

from src.features.audit.application.dtos import LogBiometricEventCommand


class ILoginHistoryReader(ABC):
    """Puerto: lee las marcas de tiempo de logins concedidos de un usuario."""

    @abstractmethod
    async def get_login_times(self, user_id: str, since: datetime) -> list[datetime]:
        raise NotImplementedError


class IAuditEventLogger(ABC):
    """Puerto: registra un evento de auditoría."""

    @abstractmethod
    async def execute(self, command: LogBiometricEventCommand) -> object:
        raise NotImplementedError
```

- [ ] **Step 4: Implementar el DTO**

Crear `apps/biometric-api/src/features/anomaly/application/__init__.py` vacío y `apps/biometric-api/src/features/anomaly/application/dtos.py`:

```python
from datetime import datetime

from hexcore.application.dtos.base import DTO


class EvaluateLoginAnomalyCommand(DTO):
    """Comando para evaluar la anomalía horaria de un login biométrico."""

    user_id: str
    attempt_time: datetime
    ip_address: str | None = None
    user_agent: str | None = None
```

- [ ] **Step 5: Implementar el use case**

Crear `apps/biometric-api/src/features/anomaly/application/use_cases.py`:

```python
from datetime import timedelta

from hexcore.application.use_cases.base import UseCase

from src.features.audit.application.dtos import LogBiometricEventCommand

from ..domain.ports import IAuditEventLogger, ILoginHistoryReader
from ..domain.services import LoginTimePatternService
from ..domain.value_objects import AnomalyResult
from .dtos import EvaluateLoginAnomalyCommand


def _to_decimal_hour(dt) -> float:
    return dt.hour + dt.minute / 60.0 + dt.second / 3600.0


class EvaluateLoginAnomalyUseCase(UseCase[EvaluateLoginAnomalyCommand, AnomalyResult]):
    """Evalúa la hora de un login y registra auditoría si es sospechoso."""

    def __init__(
        self,
        pattern_service: LoginTimePatternService,
        history_reader: ILoginHistoryReader,
        audit_logger: IAuditEventLogger,
        history_days: int = 90,
    ) -> None:
        super().__init__()
        self._pattern_service = pattern_service
        self._history_reader = history_reader
        self._audit_logger = audit_logger
        self._history_days = history_days

    async def execute(self, command: EvaluateLoginAnomalyCommand) -> AnomalyResult:
        since = command.attempt_time - timedelta(days=self._history_days)
        history = await self._history_reader.get_login_times(command.user_id, since)
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

        return result
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_evaluate_login_anomaly_use_case.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add apps/biometric-api/src/features/anomaly apps/biometric-api/tests/features/anomaly
git commit -m "feat(anomaly): use case EvaluateLoginAnomaly + puertos + DTO"
```

---

### Task 3: Infra — `AuditLoginHistoryReader` (adaptador sobre `biometric_audit_log`)

**Files:**
- Create: `apps/biometric-api/src/features/anomaly/infrastructure/__init__.py`
- Create: `apps/biometric-api/src/features/anomaly/infrastructure/repositories.py`
- Test: `apps/biometric-api/tests/features/anomaly/test_audit_login_history_reader.py`

**Interfaces:**
- Consumes: `ILoginHistoryReader` (Task 2); `BiometricAuditLogModel` de `src.shared`/`src.features.audit.infrastructure.models`.
- Produces: `AuditLoginHistoryReader(session: AsyncSession)` que implementa `get_login_times`, filtrando `action == "biometric_access_granted"`, `user_id`, `created_at >= since`, ordenado descendente, devolviendo `list[datetime]`.

> Nota: el lector recibe un `AsyncSession` directamente (no es un repo descubrible de HexCore) para evitar conflicto de descubrimiento con `BiometricAuditLogRepository`, que ya mapea la misma entidad/modelo.

- [ ] **Step 1: Escribir el test (que fallará)**

Crear `apps/biometric-api/tests/features/anomaly/test_audit_login_history_reader.py`:

```python
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_audit_login_history_reader.py -v`
Expected: FAIL (ModuleNotFoundError: `src.features.anomaly.infrastructure.repositories`).

- [ ] **Step 3: Implementar el adaptador**

Crear `apps/biometric-api/src/features/anomaly/infrastructure/__init__.py` vacío y `apps/biometric-api/src/features/anomaly/infrastructure/repositories.py`:

```python
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.audit.infrastructure.models import BiometricAuditLogModel

from ..domain.ports import ILoginHistoryReader

_GRANTED_ACTION = "biometric_access_granted"


class AuditLoginHistoryReader(ILoginHistoryReader):
    """Lee horas de accesos concedidos desde la tabla biometric_audit_log."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_login_times(self, user_id: str, since: datetime) -> list[datetime]:
        stmt = (
            select(BiometricAuditLogModel.created_at)
            .where(BiometricAuditLogModel.user_id == user_id)
            .where(BiometricAuditLogModel.action == _GRANTED_ACTION)
            .where(BiometricAuditLogModel.created_at >= since)
            .order_by(BiometricAuditLogModel.created_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_audit_login_history_reader.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/biometric-api/src/features/anomaly/infrastructure apps/biometric-api/tests/features/anomaly/test_audit_login_history_reader.py
git commit -m "feat(anomaly): adaptador AuditLoginHistoryReader sobre biometric_audit_log"
```

---

### Task 4: Config + wiring del `BackgroundTask` en `/identify`

**Files:**
- Modify: `apps/biometric-api/config.py`
- Create: `apps/biometric-api/src/features/anomaly/infrastructure/tasks.py`
- Modify: `apps/biometric-api/src/features/biometrics/infrastructure/api.py`
- Modify: `apps/biometric-api/.env.example`, `.env.example` (raíz)
- Test: `apps/biometric-api/tests/features/anomaly/test_should_run_login_detection.py`

**Interfaces:**
- Consumes: `EvaluateLoginAnomalyUseCase`, `EvaluateLoginAnomalyCommand`, `LoginTimePatternService`, `AnomalyConfig` (Tasks 1-2); `AuditLoginHistoryReader` (Task 3); `BiometricAuditLogRepository`, `LogBiometricEventUseCase` (audit); `AsyncSessionLocal`, `SqlAlchemyUnitOfWork`; `IdentificationResponse` (biometrics).
- Produces:
  - `should_run_login_detection(purpose: str, result: IdentificationResponse) -> bool` (puro).
  - `run_login_anomaly_detection(user_id: str, attempt_time: datetime, ip_address: str | None, user_agent: str | None) -> None` (crea su propia sesión, envuelto en try/except).
  - `config` con `anomaly_min_samples`, `anomaly_k`, `anomaly_min_r`, `anomaly_history_days`.

- [ ] **Step 1: Añadir parámetros a `config.py`**

En `apps/biometric-api/config.py`, dentro de `ProjectConfig`, tras el bloque "Seguridad / API Interna" (después del campo `internal_api_key`), añadir:

```python
    # Detección de anomalía horaria de logins biométricos
    anomaly_min_samples: int = Field(default=20, alias="ANOMALY_MIN_SAMPLES")
    anomaly_k: float = Field(default=2.0, alias="ANOMALY_K")
    anomaly_min_r: float = Field(default=0.35, alias="ANOMALY_MIN_R")
    anomaly_history_days: int = Field(default=90, alias="ANOMALY_HISTORY_DAYS")
```

- [ ] **Step 2: Escribir el test del helper puro (que fallará)**

Crear `apps/biometric-api/tests/features/anomaly/test_should_run_login_detection.py`:

```python
from src.features.anomaly.infrastructure.tasks import should_run_login_detection
from src.features.biometrics.application.use_cases import IdentificationResponse


def test_runs_on_login_with_match():
    result = IdentificationResponse(user_id="u1", match=True, message="ok")
    assert should_run_login_detection("login", result) is True


def test_skips_when_not_login_purpose():
    result = IdentificationResponse(user_id="u1", match=True, message="ok")
    assert should_run_login_detection("identify", result) is False


def test_skips_when_no_match():
    result = IdentificationResponse(user_id=None, match=False, message="no")
    assert should_run_login_detection("login", result) is False
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_should_run_login_detection.py -v`
Expected: FAIL (ModuleNotFoundError: `src.features.anomaly.infrastructure.tasks`).

- [ ] **Step 4: Implementar `tasks.py`**

Crear `apps/biometric-api/src/features/anomaly/infrastructure/tasks.py`:

```python
import logging
import traceback
from datetime import datetime

from hexcore.infrastructure.repositories.orms.sqlalchemy.session import (
    AsyncSessionLocal,
)
from hexcore.infrastructure.uow import SqlAlchemyUnitOfWork

from config import config

from src.features.audit.application.use_cases import LogBiometricEventUseCase
from src.features.audit.infrastructure.repositories import BiometricAuditLogRepository
from src.features.biometrics.application.use_cases import IdentificationResponse

from ..application.dtos import EvaluateLoginAnomalyCommand
from ..application.use_cases import EvaluateLoginAnomalyUseCase
from ..domain.services import LoginTimePatternService
from ..domain.value_objects import AnomalyConfig
from .repositories import AuditLoginHistoryReader

logger = logging.getLogger("anomaly")


def should_run_login_detection(purpose: str, result: IdentificationResponse) -> bool:
    """True solo para logins reales con coincidencia."""
    return purpose == "login" and result.match and bool(result.user_id)


async def run_login_anomaly_detection(
    user_id: str,
    attempt_time: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    """Evalúa la anomalía en segundo plano. Nunca propaga errores."""
    try:
        async with AsyncSessionLocal() as session:
            uow = SqlAlchemyUnitOfWork(session=session)
            history_reader = AuditLoginHistoryReader(session)
            audit_repo = BiometricAuditLogRepository(uow)
            audit_logger = LogBiometricEventUseCase(repo=audit_repo, uow=uow)
            pattern_service = LoginTimePatternService(
                AnomalyConfig(
                    min_samples=config.anomaly_min_samples,
                    k=config.anomaly_k,
                    min_r=config.anomaly_min_r,
                )
            )
            use_case = EvaluateLoginAnomalyUseCase(
                pattern_service=pattern_service,
                history_reader=history_reader,
                audit_logger=audit_logger,
                history_days=config.anomaly_history_days,
            )
            await use_case.execute(
                EvaluateLoginAnomalyCommand(
                    user_id=user_id,
                    attempt_time=attempt_time,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            )
    except Exception:  # noqa: BLE001 — la detección jamás debe afectar el login
        logger.warning("Fallo en detección de login anómalo:\n%s", traceback.format_exc())
```

- [ ] **Step 5: Correr el test del helper y verificar que pasa**

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly/test_should_run_login_detection.py -v`
Expected: PASS (3 passed).

- [ ] **Step 6: Cablear `/identify`**

En `apps/biometric-api/src/features/biometrics/infrastructure/api.py`:

(a) Añadir imports de FastAPI `BackgroundTasks`, `Request` y `Form` (ya hay `Form`). En la línea de import de fastapi, asegurar: `from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status, BackgroundTasks, Request`.

(b) Añadir el import del task y datetime al inicio del módulo:

```python
from datetime import datetime

from src.features.anomaly.infrastructure.tasks import (
    run_login_anomaly_detection,
    should_run_login_detection,
)
```

(c) Reemplazar la firma y cuerpo de `identify_user` (líneas 115-124 actuales) por:

```python
async def identify_user(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    purpose: str = Form("identify"),
    use_case: IdentifyUserUseCase = Depends(get_identify_use_case),
):
    """
    Identifica a un usuario a partir de una foto.
    Retorna el ID del usuario si hay coincidencia, o acceso denegado en caso contrario.
    Si purpose="login" y hubo match, encola la detección de anomalía horaria.
    """
    image_bytes = await file.read()
    result = await use_case.execute(IdentifyUserCommand(image_bytes=image_bytes))

    if should_run_login_detection(purpose, result):
        forwarded = request.headers.get("x-forwarded-for")
        ip = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (request.client.host if request.client else None)
        )
        background_tasks.add_task(
            run_login_anomaly_detection,
            user_id=result.user_id,
            attempt_time=datetime.now(),
            ip_address=ip,
            user_agent=request.headers.get("user-agent"),
        )

    return result
```

> Nota: el decorador `@audit_endpoint` detecta `request: Request` ya presente en la firma y no lo vuelve a añadir (ver `audit/infrastructure/decorators.py:44`). `attempt_time=datetime.now()` (naive) es consistente con el `created_at` que persiste HexCore en `biometric_audit_log`.

- [ ] **Step 7: Documentar variables en `.env.example`**

En `apps/biometric-api/.env.example` añadir al final:

```bash
# ─── Detección de logins biométricos sospechosos ──────────────────────────────
ANOMALY_MIN_SAMPLES=20
ANOMALY_K=2.0
ANOMALY_MIN_R=0.35
ANOMALY_HISTORY_DAYS=90
```

Añadir las mismas 4 líneas (con el mismo encabezado de sección) al final del `.env.example` de la raíz del repo.

- [ ] **Step 8: Verificar que la app importa sin errores y toda la suite pasa**

Run: `cd apps/biometric-api && uv run python -c "import main; print('import ok')"`
Expected: imprime `import ok` (sin ImportError). El warmup de modelos NO corre en import (está en `lifespan`).

Run: `cd apps/biometric-api && uv run pytest tests/features/anomaly -v`
Expected: PASS (todos los tests de las Tasks 1-4).

- [ ] **Step 9: Commit**

```bash
git add apps/biometric-api/config.py apps/biometric-api/src/features/anomaly/infrastructure/tasks.py apps/biometric-api/src/features/biometrics/infrastructure/api.py apps/biometric-api/.env.example .env.example apps/biometric-api/tests/features/anomaly/test_should_run_login_detection.py
git commit -m "feat(anomaly): wiring del BackgroundTask en /identify + config + env"
```

---

### Task 5: Plugin Better-Auth — enviar `purpose=login` en `authenticate-face`

**Files:**
- Modify: `packages/auth/src/plugins/biometric.ts`

**Interfaces:**
- Consumes: el campo `purpose` que `/identify` ahora acepta (Task 4). `authenticate-face` debe enviar `purpose=login`; `search-user-by-face` NO envía nada (queda en el default `"identify"`, por lo que no activa detección).

- [ ] **Step 1: Añadir `purpose=login` en `authenticateFaceHandler`**

En `packages/auth/src/plugins/biometric.ts`, dentro de `authenticateFaceHandler` (tras el bloque que arma `formData` con el `file`, antes de `callBiometricApi`, alrededor de la línea 106), añadir:

```typescript
    formData.append("purpose", "login");
```

El bloque queda así:

```typescript
    const formData = new FormData();
    formData.append(
        "file",
        base64ToBlob(body.imageBase64, body.mimeType),
        "face.jpg",
    );
    formData.append("purpose", "login");

    const result = await callBiometricApi<BiometricIdentifyResponse>("/v1/biometrics/identify", {
        body: formData,
    });
```

No modificar `searchUserByFaceHandler`.

- [ ] **Step 2: Formatear y verificar lint/tipos**

Run: `pnpm check && pnpm check-types`
Expected: sin errores de formato/lint/tipos.

- [ ] **Step 3: Commit**

```bash
git add packages/auth/src/plugins/biometric.ts
git commit -m "feat(auth): enviar purpose=login en authenticate-face para detección de anomalía"
```

---

## Verificación manual end-to-end (opcional, requiere servicios arriba)

Con `docker compose up` y modelos cargados, simular un login y, con suficiente historial atípico, comprobar que aparece un evento `biometric_suspicious_login`:

```bash
# Listar últimos eventos de auditoría (usa INTERNAL_API_KEY)
curl -s -H "Authorization: Bearer $INTERNAL_API_KEY" "http://localhost:8000/v1/audit?limit=20&sort=created_at:desc" | jq '.items[] | {action, user_id, details}'
```

Expected: tras logins fuera del patrón horario del usuario, aparece `"action": "biometric_suspicious_login"` con `details.score`, `details.mean_hour`, `details.reason`. Los logins normales NO generan el evento, y el login en sí nunca falla.

---

## Self-Review (cobertura del spec — Fase 1)

- **Detección por estadística circular (von Mises):** Task 1 (`LoginTimePatternService`). ✓
- **Guardas cold-start / patrón disperso:** Task 1 (`insufficient_history`, `no_consistent_pattern`) + tests. ✓
- **Parámetros configurables (`ANOMALY_*`):** Task 4 (config.py + .env.example). ✓
- **Historial desde `biometric_access_granted`:** Task 3 (`AuditLoginHistoryReader`). ✓
- **Evento `biometric_suspicious_login` en `biometric_audit_log`:** Task 2 (use case reusa `LogBiometricEventUseCase`). ✓
- **No bloquear ni ralentizar (BackgroundTask + try/except):** Task 4 (`run_login_anomaly_detection`, `background_tasks.add_task`). ✓
- **Solo logins reales (no `search-user-by-face`):** Task 4 (`should_run_login_detection`) + Task 5 (`purpose=login`). ✓
- **Fases 2-4 (foto SeaweedFS, SSE, Web Push):** fuera de alcance de este plan; planes propios posteriores. ✓ (documentado)

Sin placeholders. Tipos/nombres consistentes entre tareas (`AnomalyResult`, `EvaluateLoginAnomalyCommand`, `ILoginHistoryReader.get_login_times`, `should_run_login_detection`, `run_login_anomaly_detection`).
