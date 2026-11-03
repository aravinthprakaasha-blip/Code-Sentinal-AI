from __future__ import annotations

import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def error_response(
    status_code: int, code: str, message: str, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": {"code": code, "message": message},
        },
        headers=headers,
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    logger.info(
        "API request rejected method=%s path=%s status=%s",
        request.method,
        request.url.path,
        exc.status_code,
    )
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
    code = {
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        422: "invalid_request",
        429: "rate_limited",
        413: "request_too_large",
        502: "upstream_error",
        503: "service_unavailable",
        504: "upstream_timeout",
    }.get(exc.status_code, "request_failed")
    headers = {
        key: value
        for key, value in (getattr(exc, "headers", None) or {}).items()
        if key.lower() in {"retry-after", "www-authenticate"}
    }
    return error_response(exc.status_code, code, detail, headers or None)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    logger.info(
        "API request validation failed method=%s path=%s error_count=%s",
        request.method,
        request.url.path,
        len(exc.errors()),
    )
    # Report which fields failed without echoing submitted values (which may hold tokens or code).
    fields = sorted(
        {
            ".".join(str(part) for part in error.get("loc", ())[1:] if not isinstance(part, int))
            for error in exc.errors()
        }
        - {""}
    )
    messages = sorted({str(error.get("msg", "")).removeprefix("Value error, ") for error in exc.errors()})
    detail = "Request validation failed"
    if fields:
        detail += f" for: {', '.join(fields[:5])}"
    if messages and len(messages) <= 2:
        detail += f" ({'; '.join(messages)})"
    return error_response(422, "invalid_request", detail + ".")
