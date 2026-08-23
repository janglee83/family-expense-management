from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    fastapi_app = FastAPI(title="Family Expense Management API")

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    fastapi_app.include_router(health.router)
    fastapi_app.include_router(api_router, prefix="/api/v1")

    return fastapi_app


app = create_app()
