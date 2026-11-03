
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
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

        if (
            settings.firebase_project_id
            and existing.project_id != settings.firebase_project_id
        ):
            raise RuntimeError(
                "The initialized Firebase project does not match configuration."
            )

        return existing

    except ValueError:
        pass

    try:
        credential_value = settings.firebase_service_account_json

        if credential_value:
            # Support either JSON text or a path to a JSON file.
            if credential_value.strip().startswith("{"):
                service_account = json.loads(credential_value)
            else:
                service_account_path = Path(credential_value)

                if not service_account_path.is_absolute():
                    service_account_path = (
                        Path(__file__).resolve().parent.parent
                        / service_account_path
                    )

                service_account = json.loads(
                    service_account_path.read_text(encoding="utf-8")
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
    credentials_value: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> dict[str, Any]:

    if (
        credentials_value is None
        or credentials_value.scheme.lower() != "bearer"
    ):
        raise HTTPException(
            status_code=401,
            detail="A Firebase ID token is required.",
        )

    try:
        decoded = auth.verify_id_token(
            credentials_value.credentials,
            app=_firebase_app(),
            check_revoked=True,
        )

    except HTTPException:
        raise

    except auth.ExpiredIdTokenError as exc:
        raise HTTPException(
            status_code=401,
            detail="Your sign-in session has expired. Please sign in again.",
        ) from exc

    except auth.RevokedIdTokenError as exc:
        raise HTTPException(
            status_code=401,
            detail="Your sign-in session was revoked. Please sign in again.",
        ) from exc

    except auth.UserDisabledError as exc:
        raise HTTPException(
            status_code=403,
            detail="This account has been disabled.",
        ) from exc

    except auth.CertificateFetchError as exc:
        logger.warning("Could not fetch Firebase token-signing certificates")
        raise HTTPException(
            status_code=503,
            detail="The API server could not reach Firebase to verify your sign-in. Try again shortly.",
        ) from exc

    except ValueError as exc:
        if "project id is required" in str(exc).lower():
            logger.error("Firebase project ID is not configured on the API server")
            raise HTTPException(
                status_code=503,
                detail="Firebase authentication is not configured on the API server (set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON).",
            ) from exc
        logger.info("Firebase ID token verification failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=401,
            detail="Firebase ID token is invalid or expired.",
        ) from exc

    except Exception as exc:
        message = str(exc).lower()
        logger.info(
            "Firebase ID token verification failed: %s",
            type(exc).__name__,
        )
        if "audience" in message or "\"aud\"" in message or "issuer" in message:
            # Typical misconfiguration: the frontend and backend use different Firebase projects.
            raise HTTPException(
                status_code=401,
                detail=(
                    "The sign-in token was issued for a different Firebase project than the API "
                    "server uses. Make sure VITE_FIREBASE_PROJECT_ID and FIREBASE_PROJECT_ID match."
                ),
            ) from exc
        raise HTTPException(
            status_code=401,
            detail="Firebase ID token is invalid or expired.",
        ) from exc

    uid = decoded.get("uid")

    if not isinstance(uid, str) or not uid:
        raise HTTPException(
            status_code=401,
            detail="Firebase ID token has no user identity.",
        )

    return decoded
