"""FastAPI application: loads the rate tables once and serves /api."""

from __future__ import annotations

import csv
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api import docs
from app.api.errors import validation_handler
from app.api.models import Parcel
from app.api.routes import router
from app.engine.tables import RateTables, load_tables

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = REPO_ROOT / "data" / "processed"
SAMPLE_PARCELS_CSV = Path(__file__).resolve().parent / "sample_parcels.csv"
DEV_ORIGINS = ["http://localhost:5173"]


def data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR") or DEFAULT_DATA_DIR)


def load_sample_parcels(path: Path = SAMPLE_PARCELS_CSV) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    parcels = []
    for r in rows:
        clean = {k: v for k, v in r.items() if v not in ("", None)}
        parcels.append(Parcel.model_validate(clean).model_dump(exclude_none=True))
    return parcels


def create_app(tables: RateTables | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if getattr(app.state, "tables", None) is None:
            app.state.tables = load_tables(data_dir())
        yield

    app = FastAPI(
        title="Parcel rates API",
        version="0.1.0",
        lifespan=lifespan,
        openapi_url=docs.OPENAPI_URL,
        docs_url=None,
        redoc_url=None,
    )
    app.state.tables = tables
    app.state.sample_parcels = load_sample_parcels()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=DEV_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.include_router(router)
    app.include_router(docs.router)
    return app


app = create_app()
