from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# 1. Configuración de HexCore (Debe inicializarse ANTES de cualquier router)
from config import config
from hexcore.config import LazyConfig
LazyConfig._imported_config = config

# 2. Ahora sí podemos importar los routers que dependen de hexcore/sqlalchemy
from src.features.audit.infrastructure.api import router as audit_router
from src.features.biometrics.infrastructure.api import router as biometrics_router
from src.features.biometrics.application.use_cases import (
    WarmupBiometricsUseCase,
    WarmupCommand,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lógica de arranque (Startup)
    print("Iniciando warmup de biometría...")
    use_case = WarmupBiometricsUseCase()
    await use_case.execute(WarmupCommand())
    print("Modelos cargados exitosamente.")
    
    print("Biometric API está lista para recibir solicitudes.")
    print(config.sql_database_url)  # Imprime la URL de la base de datos para verificar que se ha cargado correctamente
    print(config.async_sql_database_url)

    yield  # Aquí es donde la aplicación "vive"

    # Lógica de cierre (Shutdown)
    print("Cerrando recursos de biometría...")


main_router = FastAPI(lifespan=lifespan)

# CORS para llamadas directas desde el kiosco web (apps/web) al biometric-api.
main_router.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

v1_router = APIRouter(prefix="/v1")
v1_router.include_router(biometrics_router)
v1_router.include_router(audit_router)

main_router.include_router(v1_router)
app = main_router


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
