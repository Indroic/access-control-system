from fastapi import FastAPI, APIRouter
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
v1_router = APIRouter(prefix="/v1")
v1_router.include_router(biometrics_router)

main_router.include_router(v1_router)
app = main_router


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
