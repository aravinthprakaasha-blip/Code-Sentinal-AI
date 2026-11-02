from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

import firebase_admin
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

from backend.config import get_settings

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def _firebase_app() -> firebase_admin.App:
    settings = get_settings()
    try:
        existing = firebase_admin.get_app()
        if settings.firebase_project_id and existing.project_id != settings.firebase_project_id:
            raise RuntimeError("The initialized Firebase project does not match configuration.")
        return existing
    except ValueError:
        pass

    try:
        if settings.firebase_service_account_json:
            service_account: dict[str, Any] = json.loads(
                settings.firebase_service_account_json
            )
            credential = credentials.Certificate(service_account)
        else:
            credential = credentials.ApplicationDefault()
        return firebase_admin.initialize_app(
            credential,
            {"projectId": settings.firebase_project_id}
            if settings.firebase_project_id
            else None,
        )
    except Exception as exc:
        logger.exception("Firebase Admin initialization failed")
        raise HTTPException(
            status_code=503,
            detail="Firebase authentication is not configured on the API server.",
        ) from exc


def get_current_user(
    credentials_value: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if credentials_value is None or credentials_value.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="A Firebase ID token is required.")
    try:
        decoded = auth.verify_id_token(
            credentials_value.credentials,
            app=_firebase_app(),
            check_revoked=True,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.info("Firebase ID token verification failed: %s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Firebase ID token is invalid or expired.") from exc
    uid = decoded.get("uid")
    if not isinstance(uid, str) or not uid:
        raise HTTPException(status_code=401, detail="Firebase ID token has no user identity.")
    return decoded
