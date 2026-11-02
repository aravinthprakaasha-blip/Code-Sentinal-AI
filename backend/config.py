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
    )

    environment: str = Field(default="development", alias="APP_ENV")
    cors_origins: list[str] = Field(default_factory=list, alias="CORS_ORIGINS")
    max_repository_files: int = Field(default=500, ge=1, le=5000)
    max_repository_bytes: int = Field(default=20_000_000, ge=1024, le=100_000_000)
    max_source_file_bytes: int = Field(default=500_000, ge=1024, le=5_000_000)
    github_token: str | None = Field(default=None, alias="GITHUB_TOKEN")
    firebase_project_id: str | None = Field(default=None, alias="FIREBASE_PROJECT_ID")
    firebase_service_account_json: str | None = Field(
        default=None, alias="FIREBASE_SERVICE_ACCOUNT_JSON"
    )
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")

    @model_validator(mode="after")
    def require_explicit_production_origins(self) -> Settings:
        if self.environment.lower() == "production" and "*" in self.cors_origins:
            raise ValueError("Production CORS origins must not contain a wildcard.")
        return self

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
