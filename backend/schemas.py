from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.analyzer import _safe_path


class SourceFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=5_000_000)

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        try:
            return _safe_path(value)
        except ValueError as exc:
            raise ValueError("File path must be a safe repository-relative path.") from exc


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    files: list[SourceFile] = Field(min_length=1, max_length=1000)
    repo_url: str = Field(default="local://uploaded-source", max_length=2048)
    repo_name: str = Field(default="uploaded-source", min_length=1, max_length=256)
    branch: str = Field(default="local", max_length=200)
    include_ai: bool = True
    save_history: bool = True

    @model_validator(mode="after")
    def validate_total_size(self) -> AnalyzeRequest:
        if sum(len(item.content.encode("utf-8")) for item in self.files) > 30_000_000:
            raise ValueError("Source files exceed the request size limit.")
        paths = [item.path for item in self.files]
        if len(paths) != len(set(paths)):
            raise ValueError("Source file paths must be unique.")
        return self


_GITHUB_TOKEN_PATTERN = re.compile(r"^(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$")


def _validate_github_token(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    if not _GITHUB_TOKEN_PATTERN.fullmatch(value):
        # Do not echo the value back in the error.
        raise ValueError("The GitHub token format is not recognised.")
    return value


class RepositoryAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repo_url: str = Field(min_length=1, max_length=2048)
    branch: str | None = Field(default=None, max_length=200)
    include_ai: bool = True
    # Optional, used only for this request to read a private repository the
    # user can access. Never stored or logged.
    github_token: str | None = Field(default=None, max_length=300, repr=False)

    @field_validator("github_token")
    @classmethod
    def validate_token(cls, value: str | None) -> str | None:
        return _validate_github_token(value)


class BranchListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    repo_url: str = Field(min_length=1, max_length=2048)
    github_token: str | None = Field(default=None, max_length=300, repr=False)

    @field_validator("github_token")
    @classmethod
    def validate_token(cls, value: str | None) -> str | None:
        return _validate_github_token(value)


class FindingReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    finding: dict[str, Any]
    source_snippet: str = Field(default="", max_length=4000)

    @field_validator("finding")
    @classmethod
    def limit_finding_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=True)) > 12_000:
            raise ValueError("The finding payload exceeds the size limit.")
        return value


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2000)
    scan_summary: dict[str, Any]

    @field_validator("scan_summary")
    @classmethod
    def limit_scan_summary(cls, value: dict[str, Any]) -> dict[str, Any]:
        findings = value.get("findings", [])
        if not isinstance(findings, list) or len(findings) > 20:
            raise ValueError("The assistant accepts at most 20 scan findings.")
        if len(json.dumps(value, ensure_ascii=True)) > 50_000:
            raise ValueError("The scan summary exceeds the size limit.")
        return value


class ApiResponse(BaseModel):
    success: bool
    data: Any = None
    error: dict[str, str] | None = None
