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


def test_skips_when_user_id_empty():
    result = IdentificationResponse(user_id="", match=True, message="ok")
    assert should_run_login_detection("login", result) is False
