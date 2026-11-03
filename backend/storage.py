from __future__ import annotations

import copy
import json
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


# Firestore rejects documents larger than 1 MiB. Leave headroom for metadata.
MAX_DOCUMENT_BYTES = 900_000


def _size(document: dict[str, Any]) -> int:
    return len(json.dumps(document, ensure_ascii=False, default=str).encode("utf-8"))


def compact_for_storage(result: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of ``result`` that fits in a single Firestore document.

    Large scans are trimmed progressively (code context, then per-file data, then
    the lowest-priority findings). Counts and summaries are kept intact, and the
    stored record is flagged so the UI can say the stored copy is abridged.
    """
    if _size(result) <= MAX_DOCUMENT_BYTES:
        return result
    document = copy.deepcopy(result)
    document["storage_truncated"] = True
    for finding in document.get("findings", []):
        finding["context"] = ""
    if _size(document) <= MAX_DOCUMENT_BYTES:
        return document
    document["file_metrics"] = document.get("file_metrics", [])[:300]
    document["predictions"] = document.get("predictions", [])[:300]
    document["files"] = document.get("files", [])[:500]
    coverage = document.get("coverage") or {}
    coverage["skipped_examples"] = coverage.get("skipped_examples", [])[:20]
    for finding in document.get("findings", []):
        finding["snippet"] = finding.get("snippet", "")[:200]
        finding["description"] = finding.get("description", "")[:500]
    while _size(document) > MAX_DOCUMENT_BYTES and len(document.get("findings", [])) > 20:
        document["findings"] = document["findings"][: int(len(document["findings"]) * 0.8)]
    document["findings_truncated"] = True
    return document


def save_analysis(uid: str, result: dict[str, Any]) -> None:
    _firestore_client().collection("users").document(uid).collection("analyses").document(
        result["analysis_id"]
    ).set(compact_for_storage(result))


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
