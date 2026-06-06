import inspect
import time
import functools
from typing import Any, Callable

from fastapi import Depends, Request

from ..application.dtos import LogBiometricEventCommand
from ..application.use_cases import LogBiometricEventUseCase
from .dependencies import get_audit_use_case


def audit_endpoint(
    action: str,
    *,
    result_to_action: Callable[[Any], str] | None = None,
    details_on_success: Callable[..., dict] | None = None,
    details_on_failure: Callable[..., dict] | None = None,
) -> Callable:
    """
    Decorador para endpoints FastAPI que registra automáticamente en auditoría:
    - Identidad del usuario (extrae de `user.sub` o `auth_session.user_id`)
    - IP del cliente (X-Forwarded-For o client.host)
    - User-Agent
    - Latencia de la operación
    - Éxito o fallo con detalles opcionales

    Args:
        action: Nombre base del evento de auditoría.
        result_to_action: Callback opcional `(result) -> str` para derivar el action
            del resultado (útil cuando el outcome de negocio determina el tipo de evento,
            p.ej. acceso concedido vs. denegado).
        details_on_success: Callback opcional `(result, **endpoint_kwargs) -> dict`
            para enriquecer `details` con contexto de negocio en éxito.
        details_on_failure: Callback opcional `(exc, **endpoint_kwargs) -> dict`
            para enriquecer `details` en excepción.
    """

    def decorator(fn: Callable) -> Callable:
        original_sig = inspect.signature(fn)
        original_params = list(original_sig.parameters.values())

        # Detectar si `request: Request` ya existe en la firma original
        has_request = any(
            p.name == "request" and p.annotation is Request
            for p in original_params
        )

        new_params: list[inspect.Parameter] = []
        if not has_request:
            new_params.append(
                inspect.Parameter(
                    "request",
                    inspect.Parameter.POSITIONAL_OR_KEYWORD,
                    annotation=Request,
                )
            )
        new_params.extend(original_params)
        new_params.append(
            inspect.Parameter(
                "_audit_uc",
                inspect.Parameter.KEYWORD_ONLY,
                annotation=LogBiometricEventUseCase,
                default=Depends(get_audit_use_case),
            )
        )

        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            _audit_uc: LogBiometricEventUseCase = kwargs.pop("_audit_uc")
            print(f"Audit decorator: action='{action}', user={kwargs.get('user')}, auth_session={kwargs.get('auth_session')}")

            # Extraer request (quitarlo de kwargs si fue añadido por el decorador)
            if not has_request:
                request: Request | None = kwargs.pop("request", None)
            else:
                request = kwargs.get("request")

            # Identidad del usuario
            user_id: str | None = None
            user = kwargs.get("user")
            if user is not None and hasattr(user, "sub"):
                user_id = user.sub
            else:
                session = kwargs.get("auth_session")
                if session is not None and hasattr(session, "user_id"):
                    user_id = session.user_id

            if user_id == "system" and "performed_by" in kwargs and kwargs["performed_by"]:
                user_id = kwargs["performed_by"]

            # Contexto HTTP
            ip: str | None = None
            ua: str | None = None
            if request is not None:
                forwarded = request.headers.get("x-forwarded-for")
                if forwarded:
                    ip = forwarded.split(",")[0].strip()
                elif request.client:
                    ip = request.client.host
                ua = request.headers.get("user-agent")

            t0 = time.perf_counter()
            try:
                result = await fn(*args, **kwargs)
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)

                logged_action = result_to_action(result) if result_to_action else action
                extra = details_on_success(result, **kwargs) if details_on_success else {}

                await _audit_uc.execute(
                    LogBiometricEventCommand(
                        action=logged_action,
                        user_id=user_id,
                        ip_address=ip,
                        user_agent=ua,
                        details={"success": True, "latency_ms": latency_ms, **extra},
                    )
                )
                return result

            except Exception as exc:
                latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                extra = details_on_failure(exc, **kwargs) if details_on_failure else {}

                await _audit_uc.execute(
                    LogBiometricEventCommand(
                        action=f"{action}_error",
                        user_id=user_id,
                        ip_address=ip,
                        user_agent=ua,
                        details={"success": False, "latency_ms": latency_ms, **extra},
                    )
                )
                raise

        wrapper.__signature__ = original_sig.replace(parameters=new_params)
        return wrapper

    return decorator
