"""Detection of credentials committed to source control.

Reported snippets are always redacted: CodeSentry stores the location and the
kind of secret, never the secret value itself.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from backend import findings as F

_PLACEHOLDER = re.compile(
    r"(?i)(?:your[_-]?|example|changeme|change_me|placeholder|dummy|sample|xxx+|\*{3,}|<[^>]+>|\$\{|\{\{|"
    r"process\.env|os\.environ|getenv|import\.meta\.env|env\(|test|fake|redacted|null|none|undefined|todo)"
)


def _entropy(value: str) -> float:
    counts = Counter(value)
    return -sum(count / len(value) * math.log2(count / len(value)) for count in counts.values())


def _looks_random(value: str) -> bool:
    """Generic credential literals must look like real secrets, not words such as 'secret-key'."""
    has_digit = any(char.isdigit() for char in value)
    has_alpha = any(char.isalpha() for char in value)
    return _entropy(value) >= 3.2 or (has_digit and has_alpha and len(value) >= 12)


class _SecretRule:
    def __init__(
        self,
        rule_id: str,
        title: str,
        pattern: str,
        severity: str,
        confidence: str,
        description: str,
        category: str = F.EXPOSED_SECRET,
        check_placeholder: bool = False,
        value_group: int = 0,
        require_random: bool = False,
    ) -> None:
        self.require_random = require_random
        self.rule_id = rule_id
        self.title = title
        self.pattern = re.compile(pattern)
        self.severity = severity
        self.confidence = confidence
        self.description = description
        self.category = category
        self.check_placeholder = check_placeholder
        self.value_group = value_group


SECRET_RULES = [
    _SecretRule("SECRET-PRIVATE-KEY", "Private key committed",
                r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----",
                "CRITICAL", "HIGH",
                "A private key is stored in the repository. Anyone with read access can impersonate the key owner (for example a Google/Firebase service account)."),
    _SecretRule("SECRET-AWS-KEY", "AWS access key ID",
                r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", "CRITICAL", "HIGH",
                "An AWS access key ID is committed. If its secret key is also present or leaked, the AWS account can be accessed."),
    _SecretRule("SECRET-GITHUB-TOKEN", "GitHub token",
                r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b", "CRITICAL", "HIGH",
                "A GitHub access token is committed and grants repository/API access as its owner."),
    _SecretRule("SECRET-SLACK-TOKEN", "Slack token",
                r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b", "HIGH", "HIGH",
                "A Slack token is committed."),
    _SecretRule("SECRET-STRIPE-KEY", "Stripe live secret key",
                r"\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b", "CRITICAL", "HIGH",
                "A live Stripe secret key is committed and allows payment operations."),
    _SecretRule("SECRET-LLM-KEY", "AI provider API key",
                r"\bsk-(?:proj-|ant-(?:api\d{2}-)?)?[A-Za-z0-9_-]{32,}\b", "HIGH", "MEDIUM",
                "An API key for an AI provider appears to be committed; it can be used to run requests billed to the owner."),
    _SecretRule("SECRET-GOOGLE-API-KEY", "Google API key",
                r"\bAIza[0-9A-Za-z_-]{35}\b", "MEDIUM", "HIGH",
                "A Google API key is committed. Firebase web keys are designed to be public, but Gemini/Maps/other keys are billable secrets. Restrict the key in Google Cloud Console."),
    _SecretRule("SECRET-JWT", "Hard-coded JSON Web Token",
                r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b", "MEDIUM", "MEDIUM",
                "A signed token is committed; if it is still valid it grants the access it encodes."),
    _SecretRule("SECRET-CONNECTION-STRING", "Credentials in connection string",
                r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql)://[^\s:/@\"']+:([^\s@/\"']{4,})@",
                "HIGH", "HIGH",
                "A database or broker URL with an embedded password is committed.",
                check_placeholder=True, value_group=1),
    _SecretRule("SECRET-ASSIGNMENT", "Hard-coded credential",
                r"(?i)\b(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?key)\b[\"']?\s*[:=]\s*[\"']([^\"'\s]{8,})[\"']",
                "HIGH", "MEDIUM",
                "A credential-like value is assigned as a string literal in source or configuration.",
                category=F.HARDCODED_CREDENTIALS, check_placeholder=True, value_group=1, require_random=True),
    _SecretRule("SECRET-ENV-ASSIGNMENT", "Credential in environment file",
                r"(?i)^\s*(?:export\s+)?[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS?)[A-Z0-9_]*\s*=\s*[\"']?([^\s\"'#]{8,})",
                "HIGH", "MEDIUM",
                "An environment file in the repository assigns a credential value.",
                check_placeholder=True, value_group=1),
]

_ENV_ONLY = {"SECRET-ENV-ASSIGNMENT"}
MAX_SECRET_FINDINGS_PER_FILE = 20


def _is_env_file(path: str) -> bool:
    name = path.rsplit("/", 1)[-1].lower()
    return name == ".env" or (name.startswith(".env.") and not name.endswith((".example", ".sample", ".template", ".dist")))


def _is_example_file(path: str) -> bool:
    lower = path.lower()
    return F.is_test_or_example_path(path) or any(marker in lower for marker in (".example", ".sample", ".template", "mock"))


def scan_secrets(path: str, content: str, language: str) -> list[dict[str, Any]]:
    lines = content.splitlines()
    results: list[dict[str, Any]] = []
    env_file = _is_env_file(path)
    example_file = _is_example_file(path)
    seen_lines: set[int] = set()
    is_firebase_web_config = "firebaseapp.com" in content or "firebaseConfig" in content

    if env_file:
        results.append(
            F.make_finding(
                source="security",
                rule_id="SECRET-ENV-FILE",
                title="Environment file committed to the repository",
                file_path=path,
                line=1,
                severity="HIGH",
                confidence="HIGH",
                description="A .env file is tracked in Git. These files normally hold credentials and should never be committed.",
                suggested_fix="Remove the file from Git (git rm --cached), add it to .gitignore, and rotate every credential it contained. Old commits still contain it until history is rewritten.",
                is_heuristic=False,
                snippet=path.rsplit("/", 1)[-1],
                language=language,
                category=F.EXPOSED_SECRET,
                analyzer="CodeSentry secrets",
                cwe="CWE-538",
            )
        )

    for index, line in enumerate(lines, start=1):
        if len(line) > 4000 or index in seen_lines:
            continue
        for rule in SECRET_RULES:
            if rule.rule_id in _ENV_ONLY and not env_file:
                continue
            match = rule.pattern.search(line)
            if not match:
                continue
            value = match.group(rule.value_group) if rule.value_group else match.group(0)
            if rule.check_placeholder and _PLACEHOLDER.search(value):
                continue
            if rule.require_random and not _looks_random(value):
                continue
            severity = rule.severity
            confidence = rule.confidence
            description = rule.description
            if rule.rule_id == "SECRET-GOOGLE-API-KEY" and is_firebase_web_config:
                severity, confidence = "LOW", "MEDIUM"
                description = (
                    "A Firebase web API key is committed. Firebase web keys identify the project and are "
                    "public by design, but they should be restricted to your domains and APIs in Google Cloud Console."
                )
            downgrade = example_file
            if rule.rule_id == "SECRET-PRIVATE-KEY":
                # Real key blocks in .env.example and similar files are a common leak; only trust test fixtures.
                downgrade = F.is_test_or_example_path(path)
            if downgrade and severity in {"CRITICAL", "HIGH"}:
                confidence = "LOW"
                description += " The file looks like an example or test fixture; verify whether the value is real."
            results.append(
                F.make_finding(
                    source="security",
                    rule_id=rule.rule_id,
                    title=rule.title,
                    file_path=path,
                    line=index,
                    severity=severity,
                    confidence=confidence,
                    description=description,
                    suggested_fix=(
                        "Remove the value from source, load it from an environment variable or secret manager, "
                        "and revoke/rotate it. Deleting it in a new commit does not remove it from Git history."
                    ),
                    is_heuristic=rule.confidence != "HIGH",
                    snippet=line.strip(),
                    context=F.line_context(lines, index, radius=2),
                    language=language,
                    category=rule.category,
                    analyzer="CodeSentry secrets",
                    cwe="CWE-798",
                )
            )
            seen_lines.add(index)
            break
        if len(results) >= MAX_SECRET_FINDINGS_PER_FILE:
            break
    return results
