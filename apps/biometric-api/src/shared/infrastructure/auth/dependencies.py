from functools import lru_cache
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError, decode
from pydantic import BaseModel
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
