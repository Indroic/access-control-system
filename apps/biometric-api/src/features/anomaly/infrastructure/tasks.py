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
