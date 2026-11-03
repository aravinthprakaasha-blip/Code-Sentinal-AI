"""Secret redaction shared by the scanners, AI prompts, and stored reports.

Secrets found in scanned repositories must never be copied into analysis
history, logs, or third-party AI prompts. Every snippet that leaves the
analyzer passes through ``redact``.
"""

from __future__ import annotations

import re

_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"
            r".*?(?:-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----|$)",
            re.DOTALL,
        ),
        "[REDACTED_PRIVATE_KEY]",
    ),
    (
        # Credentials embedded in URLs: scheme://user:password@host
        re.compile(r"\b([a-zA-Z][a-zA-Z0-9+.-]{1,20}://[^\s:/@\"'`]+:)([^\s@/\"'`]{1,200})(@)"),
        r"\1[REDACTED]\3",
    ),
    (re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), "[REDACTED_AWS_KEY]"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b"), "[REDACTED_GOOGLE_KEY]"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), "[REDACTED_SLACK_TOKEN]"),
    (re.compile(r"\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b"), "[REDACTED_STRIPE_KEY]"),
    (re.compile(r"\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b"), "[REDACTED_API_KEY]"),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
        "[REDACTED_JWT]",
    ),
    (
        re.compile(
            r"(?i)((?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|private[_-]?key)"
            r"[\"']?\s*[:=]\s*[\"']?)([^\"'\s,;]{6,})"
        ),
        r"\1[REDACTED]",
    ),
]


def redact(value: str) -> str:
    """Return ``value`` with credential-looking material replaced by markers."""
    if not value:
        return value
    for pattern, replacement in _PATTERNS:
        value = pattern.sub(replacement, value)
    return value
