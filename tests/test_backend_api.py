from __future__ import annotations

from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials

from backend import main
from backend import repository, storage
from backend.ai_review import _redact_source
from backend.analyzer import _safe_path, analyze_files
from backend.auth import get_current_user
from backend.repository import fetch_repository_files, parse_github_url

client = TestClient(main.app)


def test_health_endpoint_is_public_and_reports_configuration() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["service"] == "codesentry-api"
    assert body["error"] is None


def test_analysis_requires_firebase_bearer_token() -> None:
    response = client.post(
        "/api/analyze",
        json={"files": [{"path": "app.py", "content": "print('ok')"}]},
    )

    assert response.status_code == 401
    assert response.json()["success"] is False
    assert response.json()["error"]["code"] == "unauthorized"


def test_analysis_validates_unsafe_paths() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "verified-user"}
    try:
        response = client.post(
            "/api/analyze",
            headers={"Authorization": "Bearer test-token"},
            json={"files": [{"path": "../outside.py", "content": "print('no')"}]},
        )
        assert response.status_code == 422
        assert response.json()["success"] is False
        assert response.json()["error"]["code"] == "invalid_request"
    finally:
        main.app.dependency_overrides.clear()


def test_authenticated_analysis_is_stored_under_verified_uid() -> None:
    main.app.dependency_overrides[get_current_user] = lambda: {"uid": "verified-user"}
    try:
        with patch.object(main.storage, "save_analysis") as save:
            response = client.post(
                "/api/analyze",
                headers={"Authorization": "Bearer test-token"},
                json={
                    "repo_name": "sample",
                    "files": [
                        {
                            "path": "src/app.py",
                            "content": "def greet():\n    return missing_name\n",
                        }
                    ],
                    "include_ai": False,
                },
            )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["user_uid"] == "verified-user"
        assert body["data"]["findings"][0]["rule_id"] == "PY-UNDEFINED"
        save.assert_called_once()
        assert save.call_args.args[0] == "verified-user"
    finally:
        main.app.dependency_overrides.clear()


def test_analysis_rejects_non_python_uploads_instead_of_reporting_empty_scan() -> None:
    result = analyze_files(
        [{"path": "src/app.js", "content": "console.log('not python')"}],
        "local://upload",
        "upload",
        "local",
    )

    assert result["files"] == []
    assert result["warnings"] == ["Skipped non-Python file: src/app.js"]
    assert result["risk_model"].startswith("transparent-rule-based")


def test_syntax_error_is_parse_time_finding_and_does_not_run_bandit_on_invalid_file() -> None:
    with patch("backend.analyzer._run_bandit") as run_bandit:
        result = analyze_files(
            [{"path": "bad.py", "content": "def broken(:\n    pass"}],
            "local://upload",
            "upload",
            "local",
        )

    assert result["findings"][0]["rule_id"] == "PY-SYNTAX"
    assert "parse-time error" in result["findings"][0]["description"]
    run_bandit.assert_called_once_with([])


def test_bandit_reports_actual_unsafe_subprocess_call() -> None:
    result = analyze_files(
        [
            {
                "path": "unsafe.py",
                "content": "import subprocess\n\ndef run(user_input):\n    subprocess.call(user_input, shell=True)\n",
            }
        ],
        "local://upload",
        "upload",
        "local",
    )

    bandit_findings = [
        finding
        for finding in result["findings"]
        if finding["source"] == "security" and finding["rule_id"] == "B602"
    ]
    assert bandit_findings
    assert bandit_findings[0]["severity"] == "HIGH"
    assert bandit_findings[0]["is_heuristic"] is False


def test_risk_is_deterministic_and_explained() -> None:
    files = [
        {
            "path": "risk.py",
                "content": "import subprocess\n\ndef run(user_input):\n    subprocess.call(user_input, shell=True)\n",
        }
    ]
    first = analyze_files(files, "local://upload", "upload", "local")
    second = analyze_files(files, "local://upload", "upload", "local")

    assert first["risk_score"] == second["risk_score"]
    assert 0 <= first["risk_score"] <= 100
    assert first["risk_label"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    assert first["risk_reasons"]
    assert first["settings_used"]["ml_model_trained"] is False
    assert first["predictions"][0]["risk_score"] >= 0
    assert "probabilities" not in first["predictions"][0]


def test_large_finding_sets_are_capped_and_report_total_counts() -> None:
    code = "\n".join(f"def function_{index}(value=[]):\n    return value\n" for index in range(300))
    result = analyze_files(
        [{"path": "many_findings.py", "content": code}],
        "local://upload",
        "upload",
        "local",
    )

    assert result["total_findings"] >= 300
    assert len(result["findings"]) == 250
    assert result["findings_truncated"] is True
    assert result["source_counts"]["bug"] >= 300
    assert any("highest-severity findings" in warning for warning in result["warnings"])


def test_github_url_parser_rejects_other_hosts_and_deep_links() -> None:
    assert parse_github_url("https://github.com/owner/repo.git") == ("owner", "repo")
    for url in (
        "http://github.com/owner/repo",
        "https://evil.example/owner/repo",
        "https://github.com/owner/repo/tree/main",
        "https://github.com/owner/../private",
    ):
        try:
            parse_github_url(url)
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 422
        else:
            raise AssertionError(f"Expected repository URL to be rejected: {url}")


def test_missing_gemini_key_is_reported_without_failing_analysis() -> None:
    class SettingsWithoutGemini:
        gemini_api_key = None

    with patch("backend.ai_review.get_settings", return_value=SettingsWithoutGemini()):
        from backend.ai_review import review_analysis

        review = review_analysis({"findings": [], "repo_name": "sample", "risk_score": 0, "risk_label": "LOW"})

    assert review["status"] == "unavailable"
    assert review["recommendations"] == []


def test_gemini_provider_failure_returns_an_explicit_unavailable_result() -> None:
    class SettingsWithGemini:
        gemini_api_key = "configured"

    with (
        patch("backend.ai_review.get_settings", return_value=SettingsWithGemini()),
        patch("backend.ai_review._generate_json", side_effect=TimeoutError),
    ):
        from backend.ai_review import review_analysis

        review = review_analysis(
            {"findings": [], "repo_name": "sample", "risk_score": 0, "risk_label": "LOW"}
        )

    assert review["status"] == "unavailable"
    assert review["repository_review"] is None


def test_github_repository_extraction_filters_to_python_and_skips_vendor_folders() -> None:
    source_files = {
        "https://raw.githubusercontent.com/example/project/main/src/app.py": "print('safe')\n",
        "https://raw.githubusercontent.com/example/project/main/docs/stub.pyi": "def api() -> None: ...\n",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com" and request.url.path == "/repos/example/project":
            return httpx.Response(200, json={"default_branch": "main"})
        if request.url.host == "api.github.com":
            return httpx.Response(
                200,
                json={
                    "truncated": False,
                    "tree": [
                        {"type": "blob", "path": "src/app.py", "size": len(source_files[next(iter(source_files))])},
                        {"type": "blob", "path": "docs/stub.pyi", "size": len(source_files[list(source_files)[1]])},
                        {"type": "blob", "path": "node_modules/package/install.py", "size": 20},
                        {"type": "blob", "path": "src/app.ts", "size": 20},
                    ],
                },
            )
        return httpx.Response(200, content=source_files[str(request.url)])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with patch.object(repository.httpx, "Client", return_value=client):
        _, branch, files, languages, counts = fetch_repository_files(
            "https://github.com/example/project",
            None,
            main.settings,
        )

    assert branch == "main"
    assert {item["path"] for item in files} == {"src/app.py", "docs/stub.pyi"}
    assert languages == ["Python", "TypeScript"]
    assert counts["python_files"] == 2
    assert all(item["content"] for item in files)


def test_unsafe_windows_paths_are_rejected() -> None:
    for path in ("C:\\outside.py", "src\\..\\outside.py", "bad\x00name.py"):
        try:
            _safe_path(path)
        except ValueError:
            continue
        raise AssertionError(f"Expected unsafe path to be rejected: {path!r}")


def test_server_side_secret_redaction() -> None:
    secret_source = (
        'api_key = "AIzaSyDUMMYSECRET12345"\n'
        'password="super_secret_password_value"\n'
        '"ghp_abcdefghijklmnopqrstuvwxyz123456789"\n'
    )
    redacted = _redact_source(secret_source)

    assert "DUMMYSECRET" not in redacted
    assert "super_secret_password_value" not in redacted
    assert "ghp_abcdefghijklmnopqrstuvwxyz123456789" not in redacted
    assert "[REDACTED]" in redacted


def test_firebase_token_verification_uses_verified_uid() -> None:
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-id-token")
    with (
        patch("backend.auth._firebase_app", return_value=object()),
        patch("backend.auth.auth.verify_id_token", return_value={"uid": "verified-user"}) as verify,
    ):
        user = get_current_user(credentials)

    assert user["uid"] == "verified-user"
    verify.assert_called_once_with("test-id-token", app=verify.call_args.kwargs["app"], check_revoked=True)


def test_firestore_analysis_access_is_scoped_to_uid() -> None:
    with patch.object(storage, "_firestore_client") as firestore_client:
        firestore_client.return_value.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value.exists = False
        result = storage.get_analysis("owner-uid", "analysis-id")

    assert result is None
    firestore_client.return_value.collection.assert_called_once_with("users")
    firestore_client.return_value.collection.return_value.document.assert_called_once_with("owner-uid")
