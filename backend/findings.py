"""Finding construction and vulnerability-category mapping."""

from __future__ import annotations

import re
import uuid
from typing import Any

from backend.redact import redact

SEVERITIES = ("INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL")
SEVERITY_ORDER = {name: index for index, name in enumerate(SEVERITIES)}
CONFIDENCE_ORDER = {"N/A": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3}

# Vulnerability categories reported to users.
SQL_INJECTION = "SQL Injection"
XSS = "Cross-Site Scripting (XSS)"
COMMAND_INJECTION = "Command Injection"
CODE_INJECTION = "Code Injection"
PATH_TRAVERSAL = "Path Traversal"
DESERIALIZATION = "Insecure Deserialization"
HARDCODED_CREDENTIALS = "Hardcoded Credentials"
EXPOSED_SECRET = "Exposed API Key / Secret"
WEAK_AUTH = "Weak Authentication"
ACCESS_CONTROL = "Broken Access Control"
FILE_UPLOAD = "Insecure File Upload"
CRYPTO = "Unsafe Cryptography"
INFO_EXPOSURE = "Sensitive Information Exposure"
SSRF = "Server-Side Request Forgery (SSRF)"
CONFIG = "Insecure Configuration"
TRANSPORT = "Insecure Transport"
DEPENDENCY = "Vulnerable Dependency"
MEMORY = "Memory Safety"
XXE = "XML External Entity (XXE)"
OPEN_REDIRECT = "Open Redirect"
ERROR_HANDLING = "Error Handling"
FILE_HANDLING = "Insecure File Handling"
BUG = "Programming Error"
QUALITY = "Code Quality"

# Bandit test IDs -> category. IDs not listed fall back to Insecure Configuration.
BANDIT_CATEGORIES: dict[str, str] = {
    "B101": QUALITY,
    "B102": CODE_INJECTION,
    "B103": FILE_HANDLING,
    "B104": CONFIG,
    "B105": HARDCODED_CREDENTIALS,
    "B106": HARDCODED_CREDENTIALS,
    "B107": HARDCODED_CREDENTIALS,
    "B108": FILE_HANDLING,
    "B110": ERROR_HANDLING,
    "B112": ERROR_HANDLING,
    "B113": CONFIG,
    "B201": CONFIG,
    "B202": PATH_TRAVERSAL,
    "B301": DESERIALIZATION,
    "B302": DESERIALIZATION,
    "B303": CRYPTO,
    "B304": CRYPTO,
    "B305": CRYPTO,
    "B306": FILE_HANDLING,
    "B307": CODE_INJECTION,
    "B308": XSS,
    "B310": SSRF,
    "B311": CRYPTO,
    "B312": TRANSPORT,
    "B313": XXE,
    "B314": XXE,
    "B315": XXE,
    "B316": XXE,
    "B317": XXE,
    "B318": XXE,
    "B319": XXE,
    "B320": XXE,
    "B321": TRANSPORT,
    "B323": TRANSPORT,
    "B324": CRYPTO,
    "B401": TRANSPORT,
    "B402": TRANSPORT,
    "B403": DESERIALIZATION,
    "B404": COMMAND_INJECTION,
    "B405": XXE,
    "B406": XXE,
    "B407": XXE,
    "B408": XXE,
    "B409": XXE,
    "B410": XXE,
    "B411": XXE,
    "B412": CONFIG,
    "B413": CRYPTO,
    "B415": CRYPTO,
    "B501": TRANSPORT,
    "B502": TRANSPORT,
    "B503": TRANSPORT,
    "B504": TRANSPORT,
    "B505": CRYPTO,
    "B506": DESERIALIZATION,
    "B507": TRANSPORT,
    "B508": CRYPTO,
    "B509": CRYPTO,
    "B601": COMMAND_INJECTION,
    "B602": COMMAND_INJECTION,
    "B603": COMMAND_INJECTION,
    "B604": COMMAND_INJECTION,
    "B605": COMMAND_INJECTION,
    "B606": COMMAND_INJECTION,
    "B607": COMMAND_INJECTION,
    "B608": SQL_INJECTION,
    "B609": COMMAND_INJECTION,
    "B610": SQL_INJECTION,
    "B611": SQL_INJECTION,
    "B612": CONFIG,
    "B613": CODE_INJECTION,
    "B614": DESERIALIZATION,
    "B615": CONFIG,
    "B701": XSS,
    "B702": XSS,
    "B703": XSS,
    "B704": XSS,
}


def make_finding(
    *,
    source: str,
    rule_id: str,
    title: str,
    file_path: str,
    line: int,
    severity: str,
    confidence: str,
    description: str,
    suggested_fix: str,
    is_heuristic: bool,
    snippet: str,
    language: str,
    category: str,
    analyzer: str,
    cwe: str | None = None,
    context: str = "",
    references: list[str] | None = None,
) -> dict[str, Any]:
    """Create a finding with redacted evidence.

    ``snippet`` is the flagged line; ``context`` is a few surrounding lines used
    for AI review. Both are redacted so credentials are never persisted.
    """
    if severity not in SEVERITY_ORDER:
        severity = "LOW"
    if confidence not in CONFIDENCE_ORDER:
        confidence = "N/A"
    return {
        "id": str(uuid.uuid4()),
        "source": source,
        "rule_id": rule_id,
        "title": title,
        "category": category,
        "analyzer": analyzer,
        "file_path": file_path,
        "language": language,
        "line_start": max(1, line),
        "line_end": max(1, line),
        "severity": severity,
        "confidence": confidence,
        "description": description,
        "suggested_fix": suggested_fix,
        "is_heuristic": is_heuristic,
        "snippet": redact(snippet)[:1000],
        "context": redact(context)[:2000],
        "cwe": cwe,
        "references": references or [],
    }


def line_snippet(lines: list[str], line: int) -> str:
    return lines[line - 1].strip() if 0 < line <= len(lines) else ""


def line_context(lines: list[str], line: int, radius: int = 4) -> str:
    if not lines:
        return ""
    start = max(0, line - 1 - radius)
    end = min(len(lines), line + radius)
    return "\n".join(lines[start:end])


def sort_key(finding: dict[str, Any]) -> tuple[Any, ...]:
    return (
        -SEVERITY_ORDER.get(finding["severity"], 0),
        -CONFIDENCE_ORDER.get(finding["confidence"], 0),
        finding["is_heuristic"],
        finding["file_path"],
        finding["line_start"],
        finding["rule_id"],
    )


_TEST_PATH = re.compile(r"(?i)(?:^|/)(?:tests?|spec|specs|__tests__|testing|fixtures?|examples?|samples?|demo|docs?)(?:/|$)|(?:^|/)(?:test_[^/]+|[^/]+_test\.\w+|[^/]+\.(?:test|spec)\.\w+|conftest\.py)$")


def is_test_or_example_path(path: str) -> bool:
    """True for test suites, fixtures, examples and docs, where findings matter less."""
    return bool(_TEST_PATH.search(path))
