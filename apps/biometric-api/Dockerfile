# ── Stage 1: build deps (heavy ML libraries need compiler toolchain) ──────────
FROM python:3.14 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libboost-python-dev \
    libboost-thread-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Algunas dependencias (opencv-python, scikit-image) son wheels de decenas de MB;
# el timeout HTTP por defecto de uv (30s) no alcanza en redes de build lentas.
ENV UV_HTTP_TIMEOUT=300

# Copy lockfile first for better layer caching
COPY apps/biometric-api/pyproject.toml apps/biometric-api/uv.lock ./

# Install only production deps into /app/.venv
RUN uv sync --frozen --no-dev

# Copy application source
COPY apps/biometric-api/ ./

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.14 AS runner

# Install only runtime system libraries (no compilers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas0 \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
