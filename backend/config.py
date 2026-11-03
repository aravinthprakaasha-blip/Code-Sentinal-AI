from __future__ import annotations

from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed server configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        enable_decoding=False,
        populate_by_name=True,
    )

    environment: str = Field(default="development", alias="APP_ENV")
    cors_origins: list[str] = Field(default_factory=list, alias="CORS_ORIGINS")

    # Repository scan limits.
    max_repository_files: int = Field(default=1000, ge=1, le=5000, alias="MAX_REPOSITORY_FILES")
    max_repository_bytes: int = Field(default=30_000_000, ge=1024, le=200_000_000, alias="MAX_REPOSITORY_BYTES")
    max_source_file_bytes: int = Field(default=500_000, ge=1024, le=5_000_000, alias="MAX_SOURCE_FILE_BYTES")
    max_manifest_bytes: int = Field(default=5_000_000, ge=1024, le=20_000_000, alias="MAX_MANIFEST_BYTES")
    repository_timeout_seconds: int = Field(default=120, ge=10, le=600, alias="REPOSITORY_TIMEOUT_SECONDS")
    dependency_scan_enabled: bool = Field(default=True, alias="DEPENDENCY_SCAN_ENABLED")

    # Per-user rate limits (requests per minute) for expensive endpoints.
    rate_limit_analysis_per_minute: int = Field(default=6, ge=1, le=1000, alias="RATE_LIMIT_ANALYSIS_PER_MINUTE")
    rate_limit_ai_per_minute: int = Field(default=20, ge=1, le=1000, alias="RATE_LIMIT_AI_PER_MINUTE")

    github_token: str | None = Field(default=None, alias="GITHUB_TOKEN")
    firebase_project_id: str | None = Field(default=None, alias="FIREBASE_PROJECT_ID")
    firebase_service_account_json: str | None = Field(
        default=None, alias="FIREBASE_SERVICE_ACCOUNT_JSON"
    )
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-3.5-flash-lite", alias="GEMINI_MODEL")
    gemini_timeout_seconds: int = Field(default=60, ge=5, le=300, alias="GEMINI_TIMEOUT_SECONDS")

    @model_validator(mode="after")
    def require_explicit_production_origins(self) -> Settings:
        if self.environment.lower() == "production" and "*" in self.cors_origins:
            raise ValueError("Production CORS origins must not contain a wildcard.")
        return self

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("github_token", "gemini_api_key", "firebase_project_id", "firebase_service_account_json", mode="before")
    @classmethod
    def empty_string_is_unset(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
