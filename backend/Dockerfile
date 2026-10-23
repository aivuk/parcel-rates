# Backend: FastAPI rate engine over the committed CSV tables.
# Build context is the repository root (see docker-compose.yml), because the
# image needs data/processed as well as backend/.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.7.9 /uv /bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    DATA_DIR=/app/data/processed \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first, so code changes do not reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --no-cache

COPY backend/app ./app
COPY data/processed ./data/processed

RUN useradd --system --uid 10001 --no-create-home app
USER app

EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
    CMD ["python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
