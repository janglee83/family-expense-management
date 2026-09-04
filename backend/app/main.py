from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette import status
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import health
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging


def _error_response(
    *, status_code: int, code: str, message: str, details: Any | None = None
) -> JSONResponse:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


def _parse_http_exception_detail(detail: Any, status_code: int) -> tuple[str, str, Any | None]:
    if isinstance(detail, Mapping):
        code = detail.get("code")
        message = detail.get("message")
        details = detail.get("details")
        if isinstance(code, str) and isinstance(message, str):
            return code, message, details
    if isinstance(detail, str):
        return f"HTTP_{status_code}", detail, None
    if isinstance(detail, list):
        return "REQUEST_VALIDATION_ERROR", "Request validation failed", detail
    return f"HTTP_{status_code}", "Request failed", detail


def _to_json_safe(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _to_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, BaseException):
        return str(value)
    return value


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

    @fastapi_app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(
        _request: object, exc: StarletteHTTPException
    ) -> JSONResponse:
        code, message, details = _parse_http_exception_detail(exc.detail, exc.status_code)
        response = _error_response(
            status_code=exc.status_code,
            code=code,
            message=message,
            details=details,
        )
        if exc.headers:
            for key, value in exc.headers.items():
                response.headers[key] = value
        return response

    @fastapi_app.exception_handler(RequestValidationError)
    async def _request_validation_exception_handler(
        _request: object, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="REQUEST_VALIDATION_ERROR",
            message="Request validation failed",
            details=_to_json_safe(exc.errors()),
        )

    return fastapi_app


app = create_app()
