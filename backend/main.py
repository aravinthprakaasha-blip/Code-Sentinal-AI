from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.ai_review import answer_question, review_analysis, review_finding
from backend.analyzer import analyze_files
from backend.auth import get_current_user
from backend.config import get_settings
from backend.errors import error_response, http_exception_handler, validation_exception_handler
from backend.ratelimit import limiter
from backend.repository import fetch_repository, list_branches
from backend.schemas import (
    AnalyzeRequest,
    ApiResponse,
    AssistantRequest,
    BranchListRequest,
    FindingReviewRequest,
    RepositoryAnalyzeRequest,
)
from backend import storage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("codesentry.api")
settings = get_settings()

app = FastAPI(
    title="CodeSentry AI API",
    version="1.0.0",
    description="Authenticated, server-side static analysis for CodeSentry AI.",
    docs_url="/api/docs" if settings.environment != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-ID", "Retry-After"],
)

app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)


@app.middleware("http")
async def request_logging(request: Request, call_next: Callable[..., Any]) -> Any:
    request_id = str(uuid.uuid4())
    started = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "Unhandled API error request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        response = error_response(500, "internal_error", "An unexpected server error occurred.")
    response.headers["X-Request-ID"] = request_id
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    logger.info(
        "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        (time.monotonic() - started) * 1000,
    )
    return response


def _finalize_analysis(
    result: dict[str, Any],
    include_ai: bool,
    user: dict[str, Any],
    save_history: bool = True,
) -> dict[str, Any]:
    result["scan_id"] = result["analysis_id"]
    result["user_uid"] = user["uid"]
    result["total_files_scanned"] = result["coverage"]["files_scanned"]
    if include_ai:
        result["ai_review"] = review_analysis(result)
    result["saved_to_history"] = False
    if save_history:
        try:
            storage.save_analysis(user["uid"], result)
            result["saved_to_history"] = True
        except HTTPException as exc:
            # The analysis itself succeeded; report the storage problem instead of discarding it.
            result["warnings"].append(f"The analysis could not be saved to your history: {exc.detail}")
        except Exception:
            logger.exception("Saving analysis failed analysis_id=%s", result["analysis_id"])
            result["warnings"].append("The analysis could not be saved to your history (database error).")
    return result


@app.get("/api/health", response_model=ApiResponse)
def health() -> dict[str, Any]:
    configured = {
        "firebase_auth": bool(
            settings.firebase_service_account_json or settings.firebase_project_id
        ),
        "gemini": bool(settings.gemini_api_key),
        "gemini_model": settings.gemini_model if settings.gemini_api_key else None,
        "github_token": bool(settings.github_token),
        "dependency_scan": settings.dependency_scan_enabled,
        "bandit": True,
        "pyflakes": True,
    }
    return {
        "success": True,
        "data": {
            "status": "ok",
            "service": "codesentry-api",
            "version": app.version,
            "configuration": configured,
            "note": "Configuration flags show which settings are present, not that the credentials are valid.",
            "limits": {
                "max_repository_files": settings.max_repository_files,
                "max_source_file_kb": settings.max_source_file_bytes // 1000,
                "max_repository_mb": settings.max_repository_bytes // 1_000_000,
                "repository_timeout_seconds": settings.repository_timeout_seconds,
                "analysis_requests_per_minute": settings.rate_limit_analysis_per_minute,
                "ai_requests_per_minute": settings.rate_limit_ai_per_minute,
            },
            "risk_model": "transparent-rule-based",
        },
        "error": None,
    }


@app.post("/api/analyze", response_model=ApiResponse)
def analyze(
    body: AnalyzeRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    limiter.check(f"analysis:{user['uid']}", settings.rate_limit_analysis_per_minute)
    result = analyze_files(
        [file.model_dump() for file in body.files],
        body.repo_url,
        body.repo_name,
        body.branch,
        dependency_scan=settings.dependency_scan_enabled,
    )
    result = _finalize_analysis(result, body.include_ai, user, body.save_history)
    return {"success": True, "data": result, "error": None}


@app.post("/api/repository/branches", response_model=ApiResponse)
def repository_branches(
    body: BranchListRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    limiter.check(f"branches:{user['uid']}", 30)
    data = list_branches(body.repo_url, settings, body.github_token)
    return {"success": True, "data": data, "error": None}


@app.post("/api/analyze/repository", response_model=ApiResponse)
def analyze_repository(
    body: RepositoryAnalyzeRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    limiter.check(f"analysis:{user['uid']}", settings.rate_limit_analysis_per_minute)
    snapshot = fetch_repository(body.repo_url, body.branch, settings, body.github_token)
    result = analyze_files(
        snapshot.files,
        snapshot.repo_url,
        f"{snapshot.owner}/{snapshot.name}",
        snapshot.branch,
        repository_skipped=snapshot.skipped,
        skipped_examples=snapshot.skipped_examples,
        repository_file_count=snapshot.repository_file_count,
        commit_sha=snapshot.commit_sha,
        dependency_scan=settings.dependency_scan_enabled,
        extra_warnings=snapshot.warnings,
    )
    result.update(
        {
            "languages_detected_names": snapshot.languages,
            "repository_file_count": snapshot.repository_file_count,
            "repository_private": snapshot.private,
            "repository_counts": {
                "repository_files": snapshot.repository_file_count,
                "files_scanned": result["coverage"]["files_scanned"],
                "files_skipped": result["coverage"]["files_skipped"],
                "python_files": result["python_file_count"],
            },
        }
    )
    result = _finalize_analysis(result, body.include_ai, user)
    return {"success": True, "data": result, "error": None}


@app.post("/api/ai/review", response_model=ApiResponse)
def ai_review_finding(
    body: FindingReviewRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    limiter.check(f"ai:{user['uid']}", settings.rate_limit_ai_per_minute)
    result = review_finding(body.finding, body.source_snippet)
    return {"success": True, "data": result, "error": None}


@app.post("/api/ai/assistant", response_model=ApiResponse)
def ai_assistant(
    body: AssistantRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    limiter.check(f"ai:{user['uid']}", settings.rate_limit_ai_per_minute)
    result = answer_question(body.question, body.scan_summary)
    return {"success": True, "data": result, "error": None}


@app.get("/api/analysis/history", response_model=ApiResponse)
def analysis_history(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    records = storage.list_analyses(user["uid"], limit, cursor)
    next_cursor = records[-1]["analysis_id"] if len(records) == limit else None
    summaries = [
        {
            "analysis_id": record["analysis_id"],
            "scan_id": record["scan_id"],
            "repo_url": record["repo_url"],
            "repo_name": record["repo_name"],
            "branch": record["branch"],
            "created_at": record["created_at"],
            "risk_score": record["risk_score"],
            "risk_label": record["risk_label"],
            "quality_score": record["quality_score"],
            "file_count": record["file_count"],
            "findings_count": record.get("total_findings", len(record.get("findings", []))),
            "severity_counts": record.get("severity_counts", {}),
            "security_status": (record.get("security_status") or {}).get("label"),
            "coverage_status": (record.get("coverage") or {}).get("coverage_status"),
        }
        for record in records
    ]
    return {
        "success": True,
        "data": {"items": summaries, "next_cursor": next_cursor},
        "error": None,
    }


@app.get("/api/analysis/{analysis_id}", response_model=ApiResponse)
def get_analysis(
    analysis_id: str = Path(max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    record = storage.get_analysis(user["uid"], analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis was not found.")
    return {"success": True, "data": record, "error": None}


@app.delete("/api/analysis/{analysis_id}", response_model=ApiResponse)
def delete_analysis(
    analysis_id: str = Path(max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not storage.delete_analysis(user["uid"], analysis_id):
        raise HTTPException(status_code=404, detail="Analysis was not found.")
    return {"success": True, "data": {"analysis_id": analysis_id, "deleted": True}, "error": None}
