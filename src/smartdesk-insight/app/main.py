"""smartdesk-insight FastAPI application."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import schemas
from app.config import settings
from app.db import engine
from app.logging_config import configure_logging
from app.models import Base
from app.nats_consumer import consume_events
from app.routers import notifications

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables; run NATS consumer in background."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("tables_created")

    consumer_task = asyncio.create_task(consume_events())
    yield
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


app = FastAPI(
    title="SmartDesk Insight API",
    version="1.0.0-draft",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled_error", extra={"path": request.url.path})
    return JSONResponse(
        status_code=500,
        content=schemas.Error(
            code="INTERNAL_ERROR",
            message="Internal server error",
        ).model_dump(),
    )


@app.get("/healthz", response_model=schemas.HealthResponse, tags=["events"])
async def healthz():
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/readyz", tags=["events"])
async def readyz():
    """Readiness probe: verify database connectivity."""
    try:
        async with engine.connect() as conn:
            await conn.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as exc:
        logger.warning("readiness_check_failed", extra={"error": str(exc)})
        return JSONResponse(
            status_code=503,
            content=schemas.Error(code="NOT_READY", message="Database unavailable").model_dump(),
        )


app.include_router(notifications.router)
