from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import HTTPException
from firebase_admin import firestore

from backend.auth import _firebase_app

logger = logging.getLogger(__name__)


@lru_cache
def _firestore_client() -> Any:
    try:
        return firestore.client(app=_firebase_app())
    except Exception as exc:
        logger.exception("Firestore initialization failed")
        raise HTTPException(
            status_code=503,
            detail="Firestore is not configured on the API server.",
        ) from exc


def save_analysis(uid: str, result: dict[str, Any]) -> None:
    _firestore_client().collection("users").document(uid).collection("analyses").document(
        result["analysis_id"]
    ).set(result)


def get_analysis(uid: str, analysis_id: str) -> dict[str, Any] | None:
    snapshot = (
        _firestore_client()
        .collection("users")
        .document(uid)
        .collection("analyses")
        .document(analysis_id)
        .get()
    )
    return snapshot.to_dict() if snapshot.exists else None


def list_analyses(uid: str, limit: int, cursor: str | None) -> list[dict[str, Any]]:
    collection = _firestore_client().collection("users").document(uid).collection("analyses")
    query = collection.order_by("created_at", direction=firestore.Query.DESCENDING)
    if cursor:
        cursor_snapshot = collection.document(cursor).get()
        if cursor_snapshot.exists:
            query = query.start_after(cursor_snapshot)
    return [snapshot.to_dict() for snapshot in query.limit(limit).stream()]


def delete_analysis(uid: str, analysis_id: str) -> bool:
    document = (
        _firestore_client()
        .collection("users")
        .document(uid)
        .collection("analyses")
        .document(analysis_id)
    )
    snapshot = document.get()
    if not snapshot.exists:
        return False
    document.delete()
    return True
