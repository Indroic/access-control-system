from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

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

main_router.include_router(v1_router)
app = main_router


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
