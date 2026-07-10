from pathlib import Path

from hexcore.config import ServerConfig
from pydantic import Field
from pydantic import model_validator
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


def _split_database_url(url: str) -> tuple[str, str]:
    """Separa una URL de base de datos en (dialecto, resto).

    Normaliza el esquema descartando cualquier driver explícito
    (`postgresql+psycopg2`, `postgresql+asyncpg`, …) y el alias `postgres://`
    que usan algunos proveedores administrados.
    """
    scheme, sep, rest = url.partition("://")
    if not sep:
        raise ValueError(f"DATABASE_URL inválida, falta '://': {url!r}")
    dialect = scheme.split("+", 1)[0]
    if dialect == "postgres":
        dialect = "postgresql"
    return dialect, rest


class ProjectConfig(BaseSettings, ServerConfig):
    """Configuración central del servidor HexCore.

    Todas las variables se pueden sobreescribir mediante variables de entorno
    o el archivo .env ubicado en el directorio raíz del proyecto.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    base_dir: Path = Path(".")
    debug: bool = Field(default=True, alias="DEBUG")

    # Base de Datos (PostgreSQL + pgvector)
    # Única fuente de verdad: variable de entorno OBLIGATORIA `DATABASE_URL`.
    database_url: str = "postgresql://indroic:vFwLIC3G4VaLWgyLmSw3@2.24.222.241:5432/biometric_db"

    # Derivadas de `database_url` por `_build_database_urls`. HexCore las lee
    # directamente: `sql_database_url` (Alembic, síncrono) y
    # `async_sql_database_url` (motor async / asyncpg).
    sql_database_url: str = "postgresql://indroic:vFwLIC3G4VaLWgyLmSw3@2.24.222.241:5432/biometric_db"
    async_sql_database_url: str = "postgresql+asyncpg://indroic:vFwLIC3G4VaLWgyLmSw3@2.24.222.241:5432/biometric_db"

    @model_validator(mode="after")
    def _build_database_urls(self) -> "ProjectConfig":
        dialect, rest = _split_database_url(self.database_url)
        self.sql_database_url = f"{dialect}://{rest}"
        self.async_sql_database_url = f"{dialect}+asyncpg://{rest}"
        return self

    # Integración con Better Auth (Next.js)
    better_auth_url: str = Field(
        default="http://localhost:3000/api/auth",
        alias="BETTER_AUTH_URL",
    )
    better_auth_issuer: str | None = Field(
        default="http://localhost:3000",
        alias="BETTER_AUTH_ISSUER",
    )
    better_auth_audience: str | None = Field(
        default="http://localhost:3000",
        alias="BETTER_AUTH_AUDIENCE",
    )
    better_auth_jwks_url: str | None = Field(
        default=None,
        alias="BETTER_AUTH_JWKS_URL",
    )
    better_auth_jwt_algorithm: str = Field(
        default="RS256",
        alias="BETTER_AUTH_JWT_ALGORITHM",
    )

    # Hardware
    arduino_port: str = Field(
        default="/dev/ttyUSB0",
        alias="ARDUINO_PORT",
    )

    # Seguridad / API Interna
    internal_api_key: str = Field(
        default="change-me-to-a-safe-internal-secret-key-12345!!",
        alias="INTERNAL_API_KEY",
    )
    server_internal_url: str = Field(
        default="http://localhost:3000",
        alias="SERVER_INTERNAL_URL",
    )

    # Detección de anomalía horaria de logins biométricos
    anomaly_min_samples: int = Field(default=20, alias="ANOMALY_MIN_SAMPLES")
    anomaly_k: float = Field(default=2.0, alias="ANOMALY_K")
    anomaly_min_r: float = Field(default=0.35, alias="ANOMALY_MIN_R")
    anomaly_history_days: int = Field(default=90, alias="ANOMALY_HISTORY_DAYS")

    @property
    def auth_base_url(self) -> str:
        return self.better_auth_url.rstrip("/")

    @property
    def auth_issuer(self) -> str:
        return (self.better_auth_issuer or self.auth_base_url).rstrip("/")

    @property
    def auth_audience(self) -> str:
        return (self.better_auth_audience or self.auth_base_url).rstrip("/")

    @property
    def auth_jwks_url(self) -> str:
        return (self.better_auth_jwks_url or f"{self.auth_base_url}/jwks").rstrip("/")


config = ProjectConfig(
    repository_discovery_paths={
        "src.features",
        "src.shared.infrastructure.repositories",
    }
)
