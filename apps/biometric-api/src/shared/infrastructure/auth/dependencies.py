from functools import lru_cache
from typing import Any
import asyncio
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError, decode
from pydantic import BaseModel, Field
from config import config

from src.shared.domain.auth import Roles

AUTH_ISSUER = config.auth_issuer
AUTH_AUDIENCE = config.auth_audience
AUTH_JWKS_URL = config.auth_jwks_url
AUTH_ALGORITHM = config.better_auth_jwt_algorithm


class CurrentUser(BaseModel):
    sub: str
    email: str | None = None
    name: str | None = None
    role: str = "user"


class OneTimeTokenSession(BaseModel):
    user_id: str
    email: str | None = None
    name: str | None = None
    raw_session: dict[str, Any] = Field(default_factory=dict)


bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(AUTH_JWKS_URL)


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise _credentials_exception()

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(credentials.credentials)
        payload = decode(
            credentials.credentials,
            signing_key.key,
            algorithms=[AUTH_ALGORITHM],
            audience=AUTH_AUDIENCE,
            issuer=AUTH_ISSUER,
        )
    except (InvalidTokenError, PyJWKClientError):
        raise _credentials_exception() from None

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise _credentials_exception()

    name = payload.get("name")
    if not isinstance(name, str):
        name = (
            payload.get("preferred_username")
            if isinstance(payload.get("preferred_username"), str)
            else None
        )

    email = payload.get("email") if isinstance(payload.get("email"), str) else None

    raw_role = payload.get("role")
    role = raw_role if isinstance(raw_role, str) and raw_role.strip() else "user"

    return CurrentUser(
        sub=subject,
        email=email,
        name=name,
        role=role,
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != Roles.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )
    return user


def _extract_user_id(payload: Any) -> str | None:
    if isinstance(payload, dict):
        candidate_paths = (
            ("user", "id"),
            ("session", "user", "id"),
            ("data", "user", "id"),
            ("userId",),
            ("user_id",),
            ("sub",),
            ("id",),
        )
        for path in candidate_paths:
            current: Any = payload
            for key in path:
                if not isinstance(current, dict) or key not in current:
                    current = None
                    break
                current = current[key]
            if isinstance(current, str) and current.strip():
                return current
    return None


def _extract_identity(payload: Any) -> OneTimeTokenSession:
    session_payload: Any = payload

    if isinstance(payload, dict):
        if isinstance(payload.get("session"), dict):
            session_payload = payload["session"]
        elif isinstance(payload.get("data"), dict):
            session_payload = payload["data"]

    user_id = _extract_user_id(session_payload)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid one-time token",
        )

    email: str | None = None
    name: str | None = None

    if isinstance(session_payload, dict):
        raw_email = session_payload.get("email")
        if isinstance(raw_email, str) and raw_email.strip():
            email = raw_email

        raw_name = session_payload.get("name")
        if isinstance(raw_name, str) and raw_name.strip():
            name = raw_name

        if isinstance(session_payload.get("user"), dict):
            user_payload = session_payload["user"]
            user_email = user_payload.get("email")
            if email is None and isinstance(user_email, str) and user_email.strip():
                email = user_email
            user_name = user_payload.get("name")
            if name is None and isinstance(user_name, str) and user_name.strip():
                name = user_name

    return OneTimeTokenSession(
        user_id=user_id,
        email=email,
        name=name,
        raw_session=session_payload if isinstance(session_payload, dict) else {},
    )


def _verify_one_time_token_remote(token: str) -> OneTimeTokenSession:
    request = Request(
        url=f"{config.auth_base_url}/one-time-token/verify",
        method="POST",
        data=json.dumps({"token": token}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )

    try:
        with urlopen(request, timeout=10) as response:
            raw_body = response.read().decode("utf-8")
    except HTTPError as error:
        if error.code in {400, 401, 403, 404}:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid one-time token",
            ) from None
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Error de comunicación con Better Auth",
        ) from None
    except URLError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Error de comunicación con Better Auth",
        ) from None

    try:
        parsed_body = json.loads(raw_body) if raw_body else {}
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Respuesta inválida desde Better Auth",
        ) from None

    return _extract_identity(parsed_body)


async def verify_one_time_token(
    token: str = Header(..., alias="X-Better-Auth-One-Time-Token"),
) -> OneTimeTokenSession:
    if not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid one-time token",
        )

    return await asyncio.to_thread(_verify_one_time_token_remote, token)
