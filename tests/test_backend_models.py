import unittest

from backend.models import Finding, ScanResult


class ScanResultModelTests(unittest.TestCase):
    def test_round_trip_preserves_frontend_scan_fields(self) -> None:
        payload = {
            "scan_id": "scan-1",
            "repo_url": "https://github.com/example/repo",
            "repo_name": "repo",
            "branch": "main",
            "commit_sha": "abc123",
            "timestamp": "2026-01-01T00:00:00Z",
            "settings_used": {},
            "files": ["src/app.py"],
            "languages_detected": {
                "Python": {"files": 1, "loc": 12, "percentage": 100.0}
            },
            "findings": [
                {
                    "id": "finding-1",
                    "source": "security",
                    "rule_id": "SEC-TEST",
                    "title": "Test finding",
                    "file_path": "src/app.py",
                    "line_start": 1,
                    "line_end": 1,
                    "severity": "HIGH",
                    "confidence": "HIGH",
                    "description": "Test description",
                    "suggested_fix": "Test fix",
                    "is_heuristic": False,
                    "language": "Python",
                    "snippet": "unsafe_call()",
                }
            ],
            "file_metrics": [
                {
                    "path": "src/app.py",
                    "language": "Python",
                    "loc": 12,
                    "functions": 1,
                    "classes": 0,
                    "max_nesting": 1,
                    "nested_loops": 0,
                    "cyclomatic_complexity": 1,
                    "bug_count": 0,
                    "security_count": 1,
                    "quality_count": 0,
                }
            ],
            "predictions": [],
            "quality_score": 90,
            "risk_score": 70,
            "risk_label": "HIGH",
            "risk_reasons": ["1 high severity finding(s)"],
            "risk_model": "transparent-rule-based",
            "risk_breakdown": {},
            "duration_seconds": 1,
            "warnings": [],
            "logs": ["[QUEUE] Received 1 file"],
        }

        result = ScanResult.from_dict(payload)

        self.assertEqual(result.to_dict()["languages_detected"], payload["languages_detected"])
        self.assertEqual(result.to_dict()["logs"], payload["logs"])
        self.assertEqual(result.findings[0].language, "Python")
        self.assertEqual(result.findings[0].snippet, "unsafe_call()")
        self.assertEqual(result.file_metrics[0].language, "Python")
        self.assertEqual(result.risk_label, "HIGH")
        self.assertEqual(result.to_dict()["risk_reasons"], ["1 high severity finding(s)"])

    def test_finding_rejects_string_boolean(self) -> None:
        data = {
            "id": "finding-1",
            "source": "security",
            "rule_id": "SEC-TEST",
            "title": "Test finding",
            "file_path": "src/app.py",
            "line_start": 1,
            "line_end": 1,
            "severity": "HIGH",
            "confidence": "HIGH",
            "description": "Test description",
            "suggested_fix": "Test fix",
            "is_heuristic": "false",
        }

        with self.assertRaisesRegex(TypeError, "is_heuristic must be a boolean"):
            Finding.from_dict(data)


if __name__ == "__main__":
    unittest.main()
