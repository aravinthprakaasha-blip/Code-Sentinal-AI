from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.ai_review import answer_question, review_analysis, review_finding
from backend.analyzer import analyze_files
from backend.auth import get_current_user
from backend.config import get_settings
from backend.errors import error_response, http_exception_handler, validation_exception_handler
from backend.repository import fetch_repository_files
from backend.schemas import (
    AnalyzeRequest,
    ApiResponse,
    AssistantRequest,
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
    logger.info(
        "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        (time.monotonic() - started) * 1000,
    )
    return response


def _process_analysis(
    files: list[dict[str, str]],
    repo_url: str,
    repo_name: str,
    branch: str,
    include_ai: bool,
    user: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = analyze_files(files, repo_url, repo_name, branch)
    result["scan_id"] = result["analysis_id"]
    result["user_uid"] = user["uid"]
    result["total_files_scanned"] = len(files)
    if include_ai:
        result["ai_review"] = review_analysis(result)
    if extra:
        result.update(extra)
    storage.save_analysis(user["uid"], result)
    return result


@app.get("/api/health", response_model=ApiResponse)
def health() -> dict[str, Any]:
    configured = {
        "firebase_auth": bool(
            settings.firebase_service_account_json or settings.firebase_project_id
        ),
        "gemini": bool(settings.gemini_api_key),
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
            "risk_model": "transparent-rule-based",
        },
        "error": None,
    }


@app.post("/api/analyze", response_model=ApiResponse)
def analyze(
    body: AnalyzeRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    result = _process_analysis(
        [file.model_dump() for file in body.files],
        body.repo_url,
        body.repo_name,
        body.branch,
        body.include_ai,
        user,
    )
    return {"success": True, "data": result, "error": None}


@app.post("/api/analyze/repository", response_model=ApiResponse)
def analyze_repository(
    body: RepositoryAnalyzeRequest,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    repo_url, branch, files, languages, counts = fetch_repository_files(
        body.repo_url, body.branch, settings
    )
    if not files:
        raise HTTPException(
            status_code=422,
            detail="No UTF-8 Python source files were found in this public repository.",
        )
    owner_and_repo = repo_url.removeprefix("https://github.com/")
    result = _process_analysis(
        files,
        repo_url,
        owner_and_repo,
        branch,
        body.include_ai,
        user,
        {
            "languages_detected_names": languages,
            "repository_counts": counts,
            "repository_file_count": counts["repository_files"],
            "python_file_count": counts["python_files"],
        },
    )
    skipped_file_count = (
        counts["oversized_python_files"] + counts["invalid_utf8_python_files"]
    )
    if skipped_file_count:
        result["warnings"].append(
            f"Skipped {skipped_file_count} Python file(s) that exceeded size limits or were not UTF-8."
        )
    return {"success": True, "data": result, "error": None}


@app.post(
    "/api/ai/review",
    response_model=ApiResponse,
    dependencies=[Depends(get_current_user)],
)
def ai_review_finding(
    body: FindingReviewRequest,
) -> dict[str, Any]:
    result = review_finding(body.finding, body.source_snippet)
    return {"success": True, "data": result, "error": None}


@app.post(
    "/api/ai/assistant",
    response_model=ApiResponse,
    dependencies=[Depends(get_current_user)],
)
def ai_assistant(
    body: AssistantRequest,
) -> dict[str, Any]:
    result = answer_question(body.question, body.scan_summary)
    return {"success": True, "data": result, "error": None}


@app.get("/api/analysis/history", response_model=ApiResponse)
def analysis_history(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None, max_length=128),
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
            "findings_count": record.get("total_findings", len(record["findings"])),
            "severity_counts": record["severity_counts"],
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
    analysis_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    record = storage.get_analysis(user["uid"], analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis was not found.")
    return {"success": True, "data": record, "error": None}


@app.delete("/api/analysis/{analysis_id}", response_model=ApiResponse)
def delete_analysis(
    analysis_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if not storage.delete_analysis(user["uid"], analysis_id):
        raise HTTPException(status_code=404, detail="Analysis was not found.")
    return {"success": True, "data": {"analysis_id": analysis_id, "deleted": True}, "error": None}
