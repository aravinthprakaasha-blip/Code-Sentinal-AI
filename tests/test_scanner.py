"""Tests for the multi-language scanner, GitHub retrieval, dependency checks,
Gemini failure handling, authentication errors, rate limiting and storage."""

from __future__ import annotations

import json
import logging
from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth

from backend import ai_review, main, repository, storage
from backend.analyzer import analyze_files
from backend.auth import get_current_user
from backend.config import Settings
from backend.dependencies import check_dependencies, parse_manifest
from backend.ratelimit import limiter
from tests.github_fake import FakeGitHub, FakeRepo

client = TestClient(main.app)
USER_TOKEN = "ghp_" + "a" * 36
FAKE_AWS_KEY = "AKIA" + "ABCDEFGHIJKLMNOP"  # assembled so the test file itself is not a secret


def scan(files: dict[str, str], **kwargs: Any) -> dict[str, Any]:
    kwargs.setdefault("dependency_scan", False)
    return analyze_files(
        [{"path": path, "content": content} for path, content in files.items()],
        "local://test",
        "test",
        "local",
        **kwargs,
    )


def rules_hit(result: dict[str, Any]) -> set[str]:
    return {finding["rule_id"] for finding in result["findings"]}


@pytest.fixture(autouse=True)
def _reset_limits() -> None:
    limiter.reset()
    yield
    limiter.reset()
    main.app.dependency_overrides.clear()


# --------------------------------------------------------------------------
# Vulnerability detection
# --------------------------------------------------------------------------

def test_detects_core_vulnerability_categories_across_languages() -> None:
    result = scan(
        {
            "app.py": (
                "import os, pickle, sqlite3, requests\n"
                "from flask import request\n"
                "def q(uid):\n"
                "    c = sqlite3.connect('db').cursor()\n"
                "    c.execute(f\"SELECT * FROM users WHERE id={uid}\")\n"
                "    os.system('ls ' + uid)\n"
                "    return pickle.loads(uid)\n"
                "def fetch():\n"
                "    return requests.get(request.args['url'], timeout=5)\n"
                "def read():\n"
                "    return open(request.args.get('p')).read()\n"
            ),
            "server.js": (
                "const { exec } = require('child_process');\n"
                "exec('ping ' + req.query.host);\n"
                "el.innerHTML = req.query.name;\n"
                "const q = \"SELECT * FROM t WHERE id=\" + req.params.id;\n"
                "res.sendFile(req.query.file);\n"
            ),
            "index.php": "<?php\necho $_GET['name'];\ninclude($_GET['page']);\n",
            "main.c": "#include <stdio.h>\nint main(){ char b[8]; gets(b); return 0; }\n",
            "Upload.java": "Statement s = c.createStatement(); s.executeQuery(\"SELECT * FROM u WHERE n='\" + name + \"'\");\n",
            "firestore.rules": "match /{d=**} { allow read, write: if true; }\n",
        }
    )
    categories = {finding["category"] for finding in result["findings"]}
    for expected in (
        "SQL Injection",
        "Command Injection",
        "Insecure Deserialization",
        "Server-Side Request Forgery (SSRF)",
        "Path Traversal",
        "Cross-Site Scripting (XSS)",
        "Memory Safety",
        "Broken Access Control",
    ):
        assert expected in categories, expected
    assert result["risk_label"] == "CRITICAL"
    assert result["severity_counts"]["CRITICAL"] >= 2
    heuristic = [f for f in result["findings"] if f["analyzer"] == "CodeSentry rules"]
    assert heuristic and all(f["is_heuristic"] for f in heuristic)


def test_comment_lines_are_not_reported() -> None:
    result = scan({"a.js": "// eval(userInput)\n/* exec('rm ' + x) */\n"})
    assert result["findings"] == []


def test_secrets_are_detected_but_never_stored_in_results() -> None:
    github_token = "ghp_" + "Z9" * 18
    private_key = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----"
    result = scan(
        {
            "config/settings.py": f"AWS_KEY = '{FAKE_AWS_KEY}'\nTOKEN = '{github_token}'\n",
            ".env": "DB_PASSWORD=Xk29fjslQp01\n",
            "config/db.js": 'const url = "mongodb://appuser:S3cretPw77@db.example.com:27017/app";\n',
            "deploy/key.json": json.dumps({"type": "service_account", "private_key": private_key}),
        }
    )
    serialized = json.dumps(result)
    assert FAKE_AWS_KEY not in serialized
    assert github_token not in serialized
    assert "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC" not in serialized
    assert "Xk29fjslQp01" not in serialized
    assert "S3cretPw77" not in serialized
    assert "SECRET-CONNECTION-STRING" in rules_hit(result)
    assert {"SECRET-AWS-KEY", "SECRET-GITHUB-TOKEN", "SECRET-ENV-FILE", "SECRET-PRIVATE-KEY"} <= rules_hit(result)


def test_firebase_web_key_is_low_and_placeholder_values_are_ignored() -> None:
    result = scan(
        {
            "src/firebase.ts": "const firebaseConfig = { apiKey: 'AIza" + "B" * 35 + "', authDomain: 'x.firebaseapp.com' };\n",
            "settings.py": "PASSWORD = 'your-password-here'\nSECRET = 'changeme123'\nKEY = 'secret-key'\n",
        }
    )
    google = [f for f in result["findings"] if f["rule_id"] == "SECRET-GOOGLE-API-KEY"]
    assert google and google[0]["severity"] == "LOW"
    assert not [f for f in result["findings"] if f["file_path"] == "settings.py" and f["rule_id"] == "SECRET-ASSIGNMENT"]


def test_clean_code_is_not_called_secure() -> None:
    result = scan({"calc.py": "def add(a: int, b: int) -> int:\n    return a + b\n"})
    assert result["findings"] == []
    assert result["risk_score"] == 0
    assert result["security_status"]["code"] == "NO_ISSUES_DETECTED"
    assert "not a guarantee" in result["security_status"]["message"]
    assert result["coverage"]["coverage_status"] == "complete"


def test_nothing_scannable_is_not_analyzed() -> None:
    result = scan({"README.md": "# docs", "photo.kt": "fun main() {}"})
    assert result["coverage"]["files_scanned"] == 0
    assert result["security_status"]["code"] == "NOT_ANALYZED"


def test_test_fixtures_and_quality_noise_do_not_dominate_risk() -> None:
    noisy = "\n".join(f"import module_{i}" for i in range(80))
    result = scan(
        {
            "pkg/__init__.py": "from .core import thing as thing\n",
            "pkg/core.py": noisy + "\nthing = 1\n",
            "tests/test_core.py": "def test_x():\n    assert True\n    key = 'Ab12Cd34Ef56Gh78'\n",
        }
    )
    assert result["risk_label"] in {"LOW", "MEDIUM"}
    assert not [f for f in result["findings"] if f["rule_id"] == "B101"]
    assert not [f for f in result["findings"] if f["file_path"] == "pkg/__init__.py"]


def test_risk_explanation_is_published() -> None:
    result = scan({"a.py": "x = 1\n"})
    assert "risk_score = round(100" in result["risk_explanation"]


# --------------------------------------------------------------------------
# Dependencies (OSV.dev)
# --------------------------------------------------------------------------

def test_manifest_parsing_distinguishes_pinned_and_unpinned() -> None:
    packages, unpinned = parse_manifest("requirements.txt", "flask==0.12\nrequests>=2\n# c\n-r other.txt\n")
    assert packages == [{"name": "flask", "version": "0.12", "ecosystem": "PyPI", "line": 1}]
    assert unpinned == 1
    lock = json.dumps({"packages": {"": {"name": "app"}, "node_modules/lodash": {"version": "4.17.15"}}})
    packages, _ = parse_manifest("package-lock.json", lock)
    assert packages[0]["name"] == "lodash" and packages[0]["version"] == "4.17.15"


def _osv_transport(vulnerable: bool = True) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/querybatch":
            queries = json.loads(request.content)["queries"]
            return httpx.Response(200, json={"results": [
                {"vulns": [{"id": "GHSA-test-0001"}]} if vulnerable and q["package"]["name"] == "flask" else {}
                for q in queries
            ]})
        if request.url.path == "/v1/vulns/GHSA-test-0001":
            return httpx.Response(200, json={
                "id": "GHSA-test-0001",
                "aliases": ["CVE-2018-1000656"],
                "summary": "Denial of service via crafted JSON",
                "database_specific": {"severity": "HIGH", "cwe_ids": ["CWE-20"]},
                "affected": [{"package": {"name": "flask", "ecosystem": "PyPI"}, "ranges": [{"events": [{"introduced": "0"}, {"fixed": "0.12.3"}]}]}],
            })
        return httpx.Response(404)
    return httpx.MockTransport(handler)


def test_vulnerable_dependency_becomes_a_finding_with_fix_version() -> None:
    with httpx.Client(transport=_osv_transport()) as osv:
        result = scan({"requirements.txt": "flask==0.12\n"}, dependency_scan=True, dependency_client=osv)
    deps = [f for f in result["findings"] if f["source"] == "dependency"]
    assert deps and deps[0]["severity"] == "HIGH"
    assert "CVE-2018-1000656" in deps[0]["title"]
    assert "0.12.3" in deps[0]["suggested_fix"]
    assert result["coverage"]["dependency_scan"]["status"] == "completed"


def test_dependency_service_outage_is_reported_not_hidden() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    with httpx.Client(transport=httpx.MockTransport(down)) as osv:
        findings, coverage = check_dependencies([("requirements.txt", "flask==0.12\n")], client=osv)
    assert findings == [] and coverage["status"] == "unavailable"
    with httpx.Client(transport=httpx.MockTransport(down)) as osv:
        result = scan({"requirements.txt": "flask==0.12\n"}, dependency_scan=True, dependency_client=osv)
    assert any("OSV.dev" in warning for warning in result["warnings"])
    assert result["coverage"]["coverage_status"] != "complete"


# --------------------------------------------------------------------------
# GitHub retrieval
# --------------------------------------------------------------------------

def _fetch(fake: FakeGitHub, url: str, branch: str | None = None, token: str | None = None, settings: Settings | None = None):
    real_client = httpx.Client
    with patch.object(repository.httpx, "Client", lambda **kw: real_client(transport=fake.transport(), timeout=kw.get("timeout"))):
        return repository.fetch_repository(url, branch, settings or Settings(_env_file=None), token)


def _status(exc_info: pytest.ExceptionInfo) -> int:
    return exc_info.value.status_code


def test_branch_selection_scans_that_branch() -> None:
    fake = FakeGitHub(FakeRepo("o", "r", {"main": {"a.py": b"x = 1\n"}, "dev": {"b.js": b"eval(x)\n"}}))
    main_snapshot = _fetch(fake, "https://github.com/o/r")
    dev_snapshot = _fetch(fake, "https://github.com/o/r", "dev")
    tree_url_snapshot = _fetch(fake, "https://github.com/o/r/tree/dev")
    assert [f["path"] for f in main_snapshot.files] == ["a.py"]
    assert [f["path"] for f in dev_snapshot.files] == ["b.js"]
    assert tree_url_snapshot.branch == "dev"
    assert main_snapshot.commit_sha != dev_snapshot.commit_sha


@pytest.mark.parametrize(
    ("repo", "url", "branch", "status"),
    [
        (FakeRepo("o", "r", {"main": {"a.py": b"x=1"}}), "https://github.com/o/missing", None, 404),
        (FakeRepo("o", "r", {"main": {"a.py": b"x=1"}}), "https://github.com/o/r", "nope", 404),
        (FakeRepo("o", "r", {}), "https://github.com/o/r", None, 422),
        (FakeRepo("o", "r", {"main": {"a.py": b"x=1"}}), "https://github.com/o/r/blob/main/a.py", None, 422),
    ],
)
def test_repository_errors(repo: FakeRepo, url: str, branch: str | None, status: int) -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _fetch(FakeGitHub(repo), url, branch)
    assert _status(exc_info) == status


def test_rate_limit_is_reported_as_429() -> None:
    from fastapi import HTTPException

    fake = FakeGitHub(FakeRepo("o", "r", {"main": {"a.py": b"x=1"}}), rate_limited=True)
    with pytest.raises(HTTPException) as exc_info:
        _fetch(fake, "https://github.com/o/r")
    assert _status(exc_info) == 429
    assert "rate limit" in exc_info.value.detail


def test_private_repository_never_uses_server_token() -> None:
    from fastapi import HTTPException

    server_token = "ghp_" + "s" * 36
    private = FakeRepo("o", "secret", {"main": {"a.py": b"x=1"}}, private=True, allowed_tokens={server_token, USER_TOKEN})
    settings = Settings(_env_file=None, GITHUB_TOKEN=server_token)
    with pytest.raises(HTTPException) as exc_info:
        _fetch(FakeGitHub(private), "https://github.com/o/secret", settings=settings)
    assert _status(exc_info) == 403
    assert "private" in exc_info.value.detail.lower()


def test_private_repository_with_user_token_uses_authenticated_blob_api() -> None:
    private = FakeRepo("o", "secret", {"main": {"a.py": b"x = 1\n"}}, private=True, allowed_tokens={USER_TOKEN})
    fake = FakeGitHub(private)
    snapshot = _fetch(fake, "https://github.com/o/secret", token=USER_TOKEN)
    assert snapshot.private is True
    assert [f["content"] for f in snapshot.files] == ["x = 1\n"]
    assert all(r.url.host == "api.github.com" for r in fake.requests)


def test_invalid_user_token_is_401() -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _fetch(FakeGitHub(FakeRepo("o", "r", {"main": {}})), "https://github.com/o/r", token="invalid-token-for-tests")
    assert _status(exc_info) == 401


def test_file_and_size_limits_produce_partial_coverage() -> None:
    files = {f"src/m{i}.py": b"x = 1\n" for i in range(5)}
    files["big.py"] = b"#" * 2000
    settings = Settings(_env_file=None, MAX_REPOSITORY_FILES=3, MAX_SOURCE_FILE_BYTES=1024)
    snapshot = _fetch(FakeGitHub(FakeRepo("o", "r", {"main": files})), "https://github.com/o/r", settings=settings)
    assert len(snapshot.files) == 3
    assert snapshot.skipped["limit_exceeded"] == 2
    assert snapshot.skipped["oversized"] == 1
    result = analyze_files(snapshot.files, snapshot.repo_url, "r", "main", repository_skipped=snapshot.skipped, dependency_scan=False)
    assert result["coverage"]["coverage_status"] == "partial"


def test_branch_listing_endpoint_and_token_not_echoed(caplog: pytest.LogCaptureFixture) -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "u1"}
    fake = FakeGitHub(FakeRepo("o", "r", {"main": {"a.py": b"x"}, "dev": {"a.py": b"y"}}, private=True, allowed_tokens={USER_TOKEN}))
    real_client = httpx.Client
    caplog.set_level(logging.DEBUG)
    with patch.object(repository.httpx, "Client", lambda **kw: real_client(transport=fake.transport(), timeout=kw.get("timeout"))):
        response = client.post("/api/repository/branches", json={"repo_url": "https://github.com/o/r", "github_token": USER_TOKEN})
    assert response.status_code == 200
    assert response.json()["data"]["branches"] == ["main", "dev"]
    assert USER_TOKEN not in response.text
    assert USER_TOKEN not in caplog.text


def test_malformed_github_token_is_rejected_without_echo() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "u1"}
    response = client.post("/api/analyze/repository", json={"repo_url": "https://github.com/o/r", "github_token": "not-a-real-token-123"})
    assert response.status_code == 422
    assert "not-a-real-token-123" not in response.text


def test_repository_analysis_endpoint_end_to_end() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "u1"}
    fake = FakeGitHub(FakeRepo("o", "r", {"main": {"app.js": b"eval(req.query.x)\n", "README.md": b"hi"}}))
    real_client = httpx.Client
    with (
        patch.object(repository.httpx, "Client", lambda **kw: real_client(transport=fake.transport(), timeout=kw.get("timeout"))),
        patch.object(main.storage, "save_analysis") as save,
    ):
        response = client.post("/api/analyze/repository", json={"repo_url": "https://github.com/o/r", "include_ai": False})
    body = response.json()
    assert response.status_code == 200, body
    data = body["data"]
    assert data["commit_sha"] != "unknown"
    assert data["coverage"]["files_scanned"] == 1
    assert data["coverage"]["files_skipped"] == 1
    assert data["findings"][0]["rule_id"] == "JS-EVAL"
    assert data["saved_to_history"] is True
    save.assert_called_once()


def test_history_save_failure_keeps_the_analysis() -> None:
    from fastapi import HTTPException

    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "u1"}
    with patch.object(main.storage, "save_analysis", side_effect=HTTPException(503, "Firestore is not configured on the API server.")):
        response = client.post("/api/analyze", json={"files": [{"path": "a.py", "content": "x=1"}], "include_ai": False})
    assert response.status_code == 200
    assert response.json()["data"]["saved_to_history"] is False
    assert any("could not be saved" in w for w in response.json()["data"]["warnings"])


def test_sandbox_runs_can_skip_history() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "u1"}
    with patch.object(main.storage, "save_analysis") as save:
        response = client.post("/api/analyze", json={"files": [{"path": "a.py", "content": "x=1"}], "include_ai": False, "save_history": False})
    assert response.status_code == 200
    save.assert_not_called()


# --------------------------------------------------------------------------
# Rate limiting, auth, storage
# --------------------------------------------------------------------------

def test_analysis_rate_limit_returns_429_with_retry_after() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "busy-user"}
    statuses = []
    with patch.object(main.storage, "save_analysis"):
        for _ in range(main.settings.rate_limit_analysis_per_minute + 1):
            statuses.append(client.post("/api/analyze", json={"files": [{"path": "a.py", "content": "x=1"}], "include_ai": False}))
    assert statuses[-1].status_code == 429
    assert statuses[-1].json()["error"]["code"] == "rate_limited"
    assert "Retry-After" in statuses[-1].headers


@pytest.mark.parametrize(
    ("error", "status", "text"),
    [
        (firebase_auth.ExpiredIdTokenError("expired", None), 401, "expired"),
        (firebase_auth.RevokedIdTokenError("revoked"), 401, "revoked"),
        (firebase_auth.InvalidIdTokenError('Firebase ID token has incorrect "aud" (audience) claim.'), 401, "different Firebase project"),
        (firebase_auth.InvalidIdTokenError("garbage"), 401, "invalid"),
        (firebase_auth.CertificateFetchError("down", None), 503, "could not reach Firebase"),
        (ValueError("A project ID is required to access the auth service."), 503, "not configured on the API server"),
        (ValueError("Wrong number of segments in token"), 401, "invalid"),
    ],
)
def test_token_verification_errors_are_specific(error: Exception, status: int, text: str) -> None:
    from fastapi import HTTPException

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="token")
    with (
        patch("backend.auth._firebase_app", return_value=object()),
        patch("backend.auth.auth.verify_id_token", side_effect=error),
        pytest.raises(HTTPException) as exc_info,
    ):
        get_current_user(credentials)
    assert exc_info.value.status_code == status
    assert text in exc_info.value.detail


def test_every_private_endpoint_requires_auth() -> None:
    for method, path, body in (
        ("post", "/api/analyze", {"files": [{"path": "a.py", "content": "x"}]}),
        ("post", "/api/analyze/repository", {"repo_url": "https://github.com/o/r"}),
        ("post", "/api/repository/branches", {"repo_url": "https://github.com/o/r"}),
        ("get", "/api/analysis/history", None),
        ("get", "/api/analysis/abc", None),
        ("delete", "/api/analysis/abc", None),
    ):
        response = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
        assert response.status_code == 401, path
        bad = getattr(client, method)(path, headers={"Authorization": "Basic abc"}, **({"json": body} if body else {}))
        assert bad.status_code == 401, path


def test_storage_compaction_fits_firestore_limit() -> None:
    big = scan({f"f{i}.js": "eval(x)\n" * 15 for i in range(40)})
    big["findings"] = big["findings"] * 6
    for finding in big["findings"]:
        finding["context"] = "x" * 2000
        finding["snippet"] = "y" * 1000
        finding["description"] = "z" * 1500
    compact = storage.compact_for_storage(big)
    assert storage._size(compact) <= storage.MAX_DOCUMENT_BYTES
    assert compact["storage_truncated"] is True
    assert compact["total_findings"] == big["total_findings"]


def test_analysis_ids_are_validated() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "u1"}
    response = client.get("/api/analysis/bad%20id%24")
    assert response.status_code == 422


# --------------------------------------------------------------------------
# Gemini
# --------------------------------------------------------------------------

class _GeminiSettings:
    gemini_api_key = "configured-for-tests"
    gemini_model = "gemini-test"
    gemini_timeout_seconds = 5


def _sample_analysis() -> dict[str, Any]:
    return scan({"app.py": "import os\ndef r(u):\n    os.system('ls ' + u)\n", "web.js": "el.innerHTML = data;\n"})


def _genai_error(code: int, message: str, status: str):
    from google.genai import errors

    cls = errors.ClientError if code < 500 else errors.ServerError
    return cls(code, {"error": {"code": code, "message": message, "status": status}})


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (_genai_error(400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT"), "invalid_api_key"),
        (_genai_error(403, "Permission denied", "PERMISSION_DENIED"), "permission_denied"),
        (_genai_error(404, "models/x is not found", "NOT_FOUND"), "model_not_found"),
        (_genai_error(429, "Resource exhausted", "RESOURCE_EXHAUSTED"), "quota_exceeded"),
        (_genai_error(503, "Overloaded", "UNAVAILABLE"), "service_unavailable"),
        (httpx.ReadTimeout("timed out"), "timeout"),
        (json.JSONDecodeError("bad", "x", 0), "malformed_response"),
        (ai_review.GeminiError("empty_response", "Gemini returned an empty response."), "empty_response"),
    ],
)
def test_gemini_failures_are_classified(error: Exception, code: str) -> None:
    with (
        patch("backend.ai_review.get_settings", return_value=_GeminiSettings()),
        patch("backend.ai_review._generate_json", side_effect=error),
    ):
        review = ai_review.review_analysis(_sample_analysis())
        single = ai_review.review_finding({"id": "1", "title": "t"}, "x")
        answer = ai_review.answer_question("q?", {"findings": []})
    assert review["status"] == "unavailable" and review["error_code"] == code
    assert single["error_code"] == code and answer["error_code"] == code
    assert "configured-for-tests" not in json.dumps([review, single, answer])


def test_missing_gemini_key_is_explicit() -> None:
    class NoKey(_GeminiSettings):
        gemini_api_key = None

    with patch("backend.ai_review.get_settings", return_value=NoKey()):
        assert ai_review.review_analysis(_sample_analysis())["error_code"] == "not_configured"


def test_gemini_empty_text_raises_classified_error() -> None:
    fake_client = MagicMock()
    fake_client.models.generate_content.return_value = MagicMock(text="")
    with (
        patch("backend.ai_review.get_settings", return_value=_GeminiSettings()),
        patch("google.genai.Client", return_value=fake_client),
    ):
        review = ai_review.review_analysis(_sample_analysis())
    assert review["error_code"] == "empty_response"


def test_gemini_cannot_invent_findings_or_overstate_weak_evidence() -> None:
    analysis = _sample_analysis()
    heuristic = next(f for f in analysis["findings"] if f["rule_id"] == "JS-INNERHTML")
    heuristic["confidence"] = "LOW"
    bandit = next(f for f in analysis["findings"] if f["analyzer"] == "Bandit")
    model_output = {
        "repository_review": "Two issues need attention.",
        "findings": [
            {"id": bandit["id"], "verdict": "likely_true_positive", "explanation": "Shell injection", "corrected_code": "subprocess.run(['ls', u])", "severity": "LOW"},
            {"id": heuristic["id"], "verdict": "likely_true_positive", "explanation": "XSS"},
            {"id": "invented-id", "verdict": "likely_true_positive", "explanation": "Made-up RCE"},
        ],
    }
    with (
        patch("backend.ai_review.get_settings", return_value=_GeminiSettings()),
        patch("backend.ai_review._generate_json", return_value=model_output) as generate,
    ):
        review = ai_review.review_analysis(analysis)
    assert review["status"] == "available"
    assert set(review["findings"]) == {bandit["id"], heuristic["id"]}
    assert review["findings"][heuristic["id"]]["verdict"] == "needs_manual_verification"
    assert review["findings"][bandit["id"]]["ai_generated"] is True
    assert bandit["severity"] == "HIGH"  # model output cannot change scanner severity
    prompt = generate.call_args.args[0]
    assert "untrusted" in prompt and "do not invent" in prompt.lower()
