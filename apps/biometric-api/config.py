from pathlib import Path
from hexcore.config import ServerConfig

class ProjectConfig(ServerConfig):
    """Configuración central del servidor HexCore."""

    base_dir: Path = Path(".")
    debug: bool = True

    # Base de Datos (PostgreSQL + pgvector)
    sql_database_url: str = "postgresql://postgres:postgres@localhost:5432/biometric_db"
    async_sql_database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/biometric_db"
    )

    # Integración con Better Auth (Next.js)
    better_auth_url: str = "http://localhost:3000/api/auth"
    better_auth_issuer: str | None = "http://localhost:3000"
    better_auth_audience: str | None =  "http://localhost:3000"
    better_auth_jwks_url: str | None = None
    better_auth_jwt_algorithm: str = "RS256"

    # Hardware
    arduino_port: str = "COM3"  # O '/dev/ttyUSB0' en Linux

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
        return (
            self.better_auth_jwks_url or f"{self.auth_base_url}/api/auth/jwks"
        ).rstrip("/")


config = ProjectConfig(
    repository_discovery_paths={
        "src.features",
        "src.shared.infrastructure.repositories",
    }
)
