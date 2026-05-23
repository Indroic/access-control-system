from pathlib import Path

from hexcore.config import ServerConfig
from pydantic import Field
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


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
    sql_database_url: str = Field(
        default="postgresql://postgres:password@localhost:5432/access-control-system",
        validation_alias="SQL_DATABASE_URL",
    )
    async_sql_database_url: str = Field(
        default="postgresql+asyncpg://postgres:password@localhost:5432/access-control-system",
        validation_alias="ASYNC_SQL_DATABASE_URL",
    )

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
