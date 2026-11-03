"""Server-side static analysis orchestration for CodeSentry AI.

Pipeline per scan:
  * Python      -> parser, AST checks, Pyflakes, Bandit, CodeSentry rules, secrets
  * JS/TS, Java, Go, PHP, Ruby, C/C++, Rust, Shell -> CodeSentry pattern rules
    (heuristic) and secrets
  * Config / IaC / Firebase rules / .env -> configuration rules and secrets
  * Dependency manifests -> OSV.dev known-vulnerability lookup
Repository code is parsed as text and is never imported or executed.
"""

from __future__ import annotations

import ast
import io
import json
import logging
import math
import re
import subprocess
import sys
import tempfile
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

from pyflakes import api as pyflakes_api
from pyflakes.reporter import Reporter

from backend import findings as F
from backend.dependencies import check_dependencies, is_manifest
from backend.findings import (
    CONFIDENCE_ORDER,
    SEVERITY_ORDER,
    line_context,
    line_snippet,
    make_finding,
    sort_key,
)
from backend.rules import (
    UNSUPPORTED_SOURCE,
    config_language,
    is_config_file,
    language_for,
    scan_with_rules,
)
from backend.secret_scan import scan_secrets

logger = logging.getLogger(__name__)
SKIP_PATH_PARTS = {".git", "node_modules", "venv", ".venv", "__pycache__", "site-packages"}
MAX_RETURNED_FINDINGS = 250
MAX_SKIPPED_EXAMPLES = 60
MINIFIED_LINE_LENGTH = 3000
BANDIT_TIMEOUT_SECONDS = 120


class CodeMetrics(ast.NodeVisitor):
    def __init__(self) -> None:
        self.functions = 0
        self.classes = 0
        self.complexity = 1
        self.max_nesting = 0
        self.nested_loops = 0
        self._nesting = 0
        self._loop_depth = 0

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.functions += 1
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.functions += 1
        self._visit_function(node)

    def _visit_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
        self._nesting += 1
        self.max_nesting = max(self.max_nesting, self._nesting)
        for child in node.body:
            self.visit(child)
        self._nesting -= 1

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self.classes += 1
        self._visit_nested(node)

    def visit_If(self, node: ast.If) -> None:
        self.complexity += 1
        self._visit_nested(node)

    def visit_For(self, node: ast.For) -> None:
        self.complexity += 1
        self._visit_loop(node)

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self.complexity += 1
        self._visit_loop(node)

    def visit_While(self, node: ast.While) -> None:
        self.complexity += 1
        self._visit_loop(node)

    def visit_Try(self, node: ast.Try) -> None:
        self.complexity += len(node.handlers)
        self._visit_nested(node)

    def visit_TryStar(self, node: ast.TryStar) -> None:
        self.complexity += len(node.handlers)
        self._visit_nested(node)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:
        self.complexity += max(0, len(node.values) - 1)
        self.generic_visit(node)

    def _visit_nested(self, node: ast.AST) -> None:
        self._nesting += 1
        self.max_nesting = max(self.max_nesting, self._nesting)
        self.generic_visit(node)
        self._nesting -= 1

    def _visit_loop(self, node: ast.AST) -> None:
        if self._loop_depth:
            self.nested_loops += 1
        self._loop_depth += 1
        self._visit_nested(node)
        self._loop_depth -= 1


def _safe_path(path: str) -> str:
    normalized = path.replace("\\", "/")
    candidate = PurePosixPath(normalized)
    if (
        not normalized
        or len(normalized) > 500
        or candidate.is_absolute()
        or PureWindowsPath(normalized).drive
        or "\x00" in normalized
        or any(part in {"", ".", ".."} for part in normalized.split("/"))
        or any(part.lower() in SKIP_PATH_PARTS for part in candidate.parts)
    ):
        raise ValueError(f"Unsafe source file path: {path!r}")
    return candidate.as_posix()


def _pyflakes_findings(path: str, content: str, lines: list[str]) -> list[dict[str, Any]]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    reporter = Reporter(stdout, stderr)
    try:
        pyflakes_api.check(content, path, reporter)
    except Exception:
        logger.exception("Pyflakes analysis failed for %s", path)
        return []

    results: list[dict[str, Any]] = []
    for output in stdout.getvalue().splitlines():
        match = re.match(r"^.*?:(\d+):(?:\d+:)?\s*(.*)$", output)
        if not match:
            continue
        line = int(match.group(1))
        message = match.group(2)
        if "undefined name" in message or "cannot import name" in message:
            rule, title, severity, fix = (
                "PY-UNDEFINED",
                "Undefined name or import",
                "HIGH",
                "Define the name or correct the import to a module member that exists.",
            )
        elif "imported but unused" in message or "assigned to but never used" in message:
            if path.endswith("__init__.py") and "imported but unused" in message:
                continue  # package re-exports are intentional
            rule, title, severity, fix = (
                "PY-UNUSED",
                "Unused import or variable",
                "LOW",
                "Remove the unused binding or use it intentionally.",
            )
        elif "redefinition" in message:
            rule, title, severity, fix = (
                "PY-REDEFINITION",
                "Name redefined",
                "MEDIUM",
                "Rename or remove the redefined binding.",
            )
        else:
            continue
        results.append(
            make_finding(
                source="quality" if rule == "PY-UNUSED" else "bug",
                rule_id=rule,
                title=title,
                file_path=path,
                line=line,
                severity=severity,
                confidence="HIGH",
                description=message,
                suggested_fix=fix,
                is_heuristic=False,
                snippet=line_snippet(lines, line),
                context=line_context(lines, line),
                language="Python",
                category=F.BUG if rule != "PY-UNUSED" else F.QUALITY,
                analyzer="Pyflakes",
            )
        )
    return results


def _py_finding(
    path: str,
    lines: list[str],
    line: int,
    *,
    source: str,
    rule_id: str,
    title: str,
    severity: str,
    description: str,
    fix: str,
    heuristic: bool,
    category: str,
) -> dict[str, Any]:
    return make_finding(
        source=source,
        rule_id=rule_id,
        title=title,
        file_path=path,
        line=line,
        severity=severity,
        confidence="HIGH",
        description=description,
        suggested_fix=fix,
        is_heuristic=heuristic,
        snippet=line_snippet(lines, line),
        context=line_context(lines, line),
        language="Python",
        category=category,
        analyzer="Python AST",
    )


def _ast_findings(path: str, lines: list[str], tree: ast.Module) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end_line = getattr(node, "end_lineno", node.lineno) or node.lineno
            if end_line - node.lineno + 1 > 50:
                results.append(
                    _py_finding(
                        path, lines, node.lineno,
                        source="quality", rule_id="PY-FUNCTION-LENGTH", title="Long function",
                        severity="LOW",
                        description=f"Function spans {end_line - node.lineno + 1} lines; large functions are harder to review and test.",
                        fix="Split the function into smaller, cohesive helpers.",
                        heuristic=True, category=F.QUALITY,
                    )
                )
            for default in node.args.defaults + node.args.kw_defaults:
                if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                    results.append(
                        _py_finding(
                            path, lines, default.lineno,
                            source="bug", rule_id="PY-MUTABLE-DEFAULT", title="Mutable default argument",
                            severity="MEDIUM",
                            description="Mutable default values are shared between calls to this function.",
                            fix="Use None as the default and create the mutable value inside the function.",
                            heuristic=False, category=F.BUG,
                        )
                    )
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            results.append(
                _py_finding(
                    path, lines, node.lineno,
                    source="bug", rule_id="PY-BARE-EXCEPT", title="Bare exception handler",
                    severity="MEDIUM",
                    description="A bare except catches system-exiting exceptions as well as application errors.",
                    fix="Catch the specific exception types expected from this operation.",
                    heuristic=False, category=F.ERROR_HANDLING,
                )
            )
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
            if isinstance(node.right, ast.Constant) and node.right.value == 0 and not isinstance(node.right.value, bool):
                results.append(
                    _py_finding(
                        path, lines, node.lineno,
                        source="bug", rule_id="PY-DIV-ZERO", title="Division by literal zero",
                        severity="HIGH",
                        description="A division operation uses a literal zero denominator and will raise ZeroDivisionError.",
                        fix="Correct the denominator or validate it before division.",
                        heuristic=False, category=F.BUG,
                    )
                )
    metrics = CodeMetrics()
    metrics.visit(tree)
    if metrics.complexity > 15:
        results.append(
            _py_finding(
                path, lines, 1,
                source="quality", rule_id="PY-COMPLEXITY", title="High cyclomatic complexity",
                severity="MEDIUM",
                description=f"File-level cyclomatic complexity is {metrics.complexity}, above the maintainability threshold of 15.",
                fix="Split complex branching into smaller functions and simplify conditional logic.",
                heuristic=True, category=F.QUALITY,
            )
        )
    return results


def _run_bandit(files: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """Run Bandit on syntax-valid Python files.

    Files are written under neutral numeric names in a private temporary
    directory and Bandit is pointed at the directory (not a long argument
    list), which keeps large scans within Windows command-line limits.
    Repository code is never imported or executed.
    """
    results: list[dict[str, Any]] = []
    if not files:
        return results
    with tempfile.TemporaryDirectory(prefix="codesentry-bandit-") as temp_dir:
        root = Path(temp_dir).resolve()
        path_map: dict[str, tuple[str, list[str]]] = {}
        for index, (relative_path, content) in enumerate(files):
            safe = _safe_path(relative_path)
            name = f"{index}.py"
            (root / name).write_text(content, encoding="utf-8")
            path_map[name] = (safe, content.splitlines())
        try:
            completed = subprocess.run(
                [sys.executable, "-m", "bandit", "-r", str(root), "-f", "json", "-q"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=BANDIT_TIMEOUT_SECONDS,
                check=False,
                shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            logger.warning("Bandit exceeded its %s-second timeout", BANDIT_TIMEOUT_SECONDS)
            raise RuntimeError("Python security analysis (Bandit) timed out.") from exc
        if completed.returncode not in {0, 1}:
            logger.error("Bandit failed with exit code %s", completed.returncode)
            raise RuntimeError("Python security scanner (Bandit) failed to complete.")
        try:
            output = json.loads(completed.stdout or "{}")
        except json.JSONDecodeError as exc:
            logger.exception("Bandit returned invalid JSON")
            raise RuntimeError("Python security scanner (Bandit) returned an invalid response.") from exc
        for item in output.get("results", []):
            mapped = path_map.get(Path(item.get("filename", "")).name)
            if mapped is None:
                continue
            relative_path, lines = mapped
            test_id = str(item.get("test_id", "BANDIT"))
            if test_id == "B101" and F.is_test_or_example_path(relative_path):
                continue  # assert statements are expected in test suites
            line = int(item.get("line_number", 1))
            severity = str(item.get("issue_severity", "LOW")).upper()
            confidence = str(item.get("issue_confidence", "N/A")).upper()
            cwe_value = item.get("issue_cwe") or {}
            more_info = item.get("more_info")
            results.append(
                make_finding(
                    source="quality" if test_id == "B101" else "security",
                    rule_id=test_id,
                    title=str(item.get("test_name", "Bandit security finding")).replace("_", " "),
                    file_path=relative_path,
                    line=line,
                    severity=severity,
                    confidence=confidence,
                    description=str(item.get("issue_text", "")),
                    suggested_fix="Review the flagged operation and apply the mitigation documented for this Bandit rule.",
                    is_heuristic=False,
                    snippet=line_snippet(lines, line),
                    context=line_context(lines, line),
                    language="Python",
                    category=F.BANDIT_CATEGORIES.get(test_id, F.CONFIG),
                    analyzer="Bandit",
                    cwe=f"CWE-{cwe_value['id']}" if cwe_value.get("id") else None,
                    references=[more_info] if isinstance(more_info, str) else [],
                )
            )
    return results


def _deduplicate(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse findings reported by several analyzers for the same line and category.

    The verified (non-heuristic), most severe, most confident report wins.
    """
    best: dict[tuple[str, int, str], dict[str, Any]] = {}
    order: list[tuple[str, int, str]] = []
    for item in items:
        category = item["category"]
        if category == F.EXPOSED_SECRET:
            category = F.HARDCODED_CREDENTIALS
        key = (item["file_path"], item["line_start"], category if item["source"] in {"security", "dependency"} else item["rule_id"])
        if item["source"] == "dependency" or item["rule_id"] == "SECRET-ENV-FILE":
            key = (item["file_path"], item["line_start"], item["rule_id"])
        current = best.get(key)
        if current is None:
            best[key] = item
            order.append(key)
            continue
        rank_new = (not item["is_heuristic"], SEVERITY_ORDER[item["severity"]], CONFIDENCE_ORDER[item["confidence"]])
        rank_old = (not current["is_heuristic"], SEVERITY_ORDER[current["severity"]], CONFIDENCE_ORDER[current["confidence"]])
        if rank_new > rank_old:
            best[key] = item
    return [best[key] for key in order]


# --------------------------------------------------------------------------
# Transparent risk model
# --------------------------------------------------------------------------
RISK_SEVERITY_WEIGHT = {"CRITICAL": 40.0, "HIGH": 20.0, "MEDIUM": 8.0, "LOW": 2.0, "INFORMATIONAL": 0.0}
RISK_CONFIDENCE_FACTOR = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4, "N/A": 0.7}
RISK_SOURCE_FACTOR = {"security": 1.0, "dependency": 0.8, "bug": 0.5, "quality": 0.15}
RISK_SCALE = 80.0
RISK_BUG_POINT_CAP = 20.0
RISK_QUALITY_POINT_CAP = 6.0
RISK_TEST_PATH_FACTOR = 0.25
QUALITY_POINTS = {"CRITICAL": 25, "HIGH": 15, "MEDIUM": 7, "LOW": 2, "INFORMATIONAL": 0}
RISK_MODEL_DESCRIPTION = (
    "points = Σ severity_weight × confidence_factor × source_factor × location_factor over every finding "
    "(severity CRITICAL 40, HIGH 20, MEDIUM 8, LOW 2, INFO 0; confidence HIGH 1.0, MEDIUM 0.7, LOW 0.4; "
    "source security 1.0, dependency 0.8, bug 0.5, quality 0.15; location 0.25 for tests, fixtures, "
    "examples and docs, otherwise 1.0). Bug points are capped at 20 and quality points at 6 so that "
    "code-quality noise cannot dominate the security score. "
    "risk_score = round(100 × (1 − e^(−points/80))). "
    "Label: ≥70 CRITICAL, ≥45 HIGH, ≥20 MEDIUM, otherwise LOW; a CRITICAL finding with HIGH or MEDIUM "
    "confidence raises the label to at least HIGH. The score only reflects files that were actually "
    "scanned and is a prioritisation aid, not proof that code is exploitable or safe."
)


def _finding_points(item: dict[str, Any]) -> float:
    return (
        RISK_SEVERITY_WEIGHT.get(item["severity"], 0.0)
        * RISK_CONFIDENCE_FACTOR.get(item["confidence"], 0.7)
        * RISK_SOURCE_FACTOR.get(item["source"], 0.5)
        * (RISK_TEST_PATH_FACTOR if F.is_test_or_example_path(item["file_path"]) else 1.0)
    )


def _risk_points(items: list[dict[str, Any]]) -> float:
    security = sum(_finding_points(item) for item in items if item["source"] in {"security", "dependency"})
    bugs = min(RISK_BUG_POINT_CAP, sum(_finding_points(item) for item in items if item["source"] == "bug"))
    quality = min(RISK_QUALITY_POINT_CAP, sum(_finding_points(item) for item in items if item["source"] == "quality"))
    return security + bugs + quality


def _score(points: float) -> int:
    return min(100, round(100 * (1 - math.exp(-points / RISK_SCALE))))


def _label(score: int, items: list[dict[str, Any]]) -> str:
    label = "CRITICAL" if score >= 70 else "HIGH" if score >= 45 else "MEDIUM" if score >= 20 else "LOW"
    has_confident_critical = any(
        item["severity"] == "CRITICAL"
        and item["confidence"] in {"HIGH", "MEDIUM"}
        and item["source"] in {"security", "dependency"}
        and not F.is_test_or_example_path(item["file_path"])
        for item in items
    )
    if has_confident_critical and SEVERITY_ORDER[label] < SEVERITY_ORDER["HIGH"]:
        label = "HIGH"
    return label


def _security_status(
    risk_label: str,
    security_items: list[dict[str, Any]],
    coverage: dict[str, Any],
) -> dict[str, str]:
    if coverage["files_scanned"] == 0:
        return {
            "code": "NOT_ANALYZED",
            "label": "Not analyzed",
            "message": "No supported source files were scanned, so no security conclusion can be drawn.",
        }
    partial = coverage["coverage_status"] != "complete"
    suffix = (
        " Coverage is incomplete — see the skipped and unsupported files; unscanned code may contain issues."
        if partial
        else ""
    )
    if not security_items:
        return {
            "code": "NO_ISSUES_DETECTED",
            "label": "No security issues detected" + (" (partial coverage)" if partial else ""),
            "message": "The configured scanners reported no security findings. This is not a guarantee that the code is secure; static analysis cannot detect every vulnerability, especially logic and access-control flaws." + suffix,
        }
    return {
        "code": f"{risk_label}_RISK",
        "label": f"{risk_label.title()} risk" + (" (partial coverage)" if partial else ""),
        "message": f"{len(security_items)} security or dependency finding(s) need review. Heuristic findings should be verified manually." + suffix,
    }


def _empty_metrics(path: str, language: str, loc: int) -> dict[str, Any]:
    return {
        "path": path,
        "language": language,
        "loc": loc,
        "functions": 0,
        "classes": 0,
        "max_nesting": 0,
        "nested_loops": 0,
        "cyclomatic_complexity": 0,
        "bug_count": 0,
        "security_count": 0,
        "quality_count": 0,
    }


def classify(path: str) -> tuple[str, str] | None:
    """Return (kind, language) for a path, or None when CodeSentry cannot analyze it."""
    language = language_for(path)
    if is_manifest(path):
        return "manifest", "Dependencies"
    if language:
        return "code", language
    if is_config_file(path):
        return "config", config_language(path)
    return None


def analyze_files(
    source_files: list[dict[str, str]],
    repo_url: str,
    repo_name: str,
    branch: str,
    *,
    repository_skipped: dict[str, int] | None = None,
    skipped_examples: list[dict[str, str]] | None = None,
    repository_file_count: int | None = None,
    commit_sha: str = "unknown",
    dependency_scan: bool = True,
    dependency_client: Any = None,
    extra_warnings: list[str] | None = None,
) -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    warnings: list[str] = list(extra_warnings or [])
    skipped = {
        "vendor_or_generated": 0,
        "binary_or_media": 0,
        "unsupported_type": 0,
        "oversized": 0,
        "not_utf8": 0,
        "limit_exceeded": 0,
        "documentation_or_other": 0,
    }
    for key, value in (repository_skipped or {}).items():
        skipped[key] = skipped.get(key, 0) + value
    examples: list[dict[str, str]] = list(skipped_examples or [])
    unsupported_languages: Counter[str] = Counter()

    code_files: list[tuple[str, str, str]] = []
    config_files: list[tuple[str, str, str]] = []
    manifests: list[tuple[str, str]] = []
    all_paths: list[str] = []
    for file in source_files:
        path = _safe_path(file["path"])
        content = file["content"]
        kind = classify(path)
        if kind is None:
            extension = PurePosixPath(path).suffix.lower()
            if extension in UNSUPPORTED_SOURCE:
                unsupported_languages[UNSUPPORTED_SOURCE[extension]] += 1
                skipped["unsupported_type"] += 1
                reason = f"unsupported language ({UNSUPPORTED_SOURCE[extension]})"
            else:
                skipped["documentation_or_other"] += 1
                reason = "not a supported source or configuration file"
            if len(examples) < MAX_SKIPPED_EXAMPLES:
                examples.append({"path": path, "reason": reason})
            continue
        all_paths.append(path)
        if any(len(line) > MINIFIED_LINE_LENGTH for line in content.splitlines()[:50]) or path.lower().endswith((".min.js", ".bundle.js")):
            skipped["vendor_or_generated"] += 1
            all_paths.pop()
            if len(examples) < MAX_SKIPPED_EXAMPLES:
                examples.append({"path": path, "reason": "minified or generated file"})
            continue
        if kind[0] == "manifest":
            manifests.append((path, content))
            config_files.append((path, content, "JSON" if path.lower().endswith(".json") else "Config"))
        elif kind[0] == "code":
            code_files.append((path, content, kind[1]))
        else:
            config_files.append((path, content, kind[1]))

    all_findings: list[dict[str, Any]] = []
    file_metrics: list[dict[str, Any]] = []
    valid_python: list[tuple[str, str]] = []
    failures: list[dict[str, str]] = []
    language_stats: dict[str, dict[str, Any]] = {}
    total_loc = 0

    def add_language(language: str, loc: int, analyzers: list[str]) -> None:
        stat = language_stats.setdefault(language, {"files": 0, "loc": 0, "analyzers": set()})
        stat["files"] += 1
        stat["loc"] += loc
        stat["analyzers"].update(analyzers)

    for path, content, language in code_files:
        lines = content.splitlines()
        loc = sum(bool(line.strip()) for line in lines)
        total_loc += loc
        if language == "Python":
            try:
                tree = ast.parse(content, filename=path)
            except (SyntaxError, ValueError) as exc:
                line = getattr(exc, "lineno", None) or 1
                message = getattr(exc, "msg", str(exc))
                all_findings.append(
                    make_finding(
                        source="bug",
                        rule_id="PY-SYNTAX",
                        title="Python syntax error",
                        file_path=path,
                        line=line,
                        severity="HIGH",
                        confidence="HIGH",
                        description=f"Python could not parse this file: {message}. This is a parse-time error, not a runtime error.",
                        suggested_fix="Correct the indicated syntax before running or analyzing this module.",
                        is_heuristic=False,
                        snippet=line_snippet(lines, line),
                        context=line_context(lines, line),
                        language="Python",
                        category=F.BUG,
                        analyzer="Python parser",
                    )
                )
                failures.append({"path": path, "reason": "Python syntax error — AST, Pyflakes, and Bandit checks skipped"})
                warnings.append(f"Skipped semantic and Bandit analysis for syntax-invalid file: {path}")
                all_findings.extend(scan_secrets(path, content, language))
                all_findings.extend(scan_with_rules(path, content, language))
                add_language(language, loc, ["Python parser", "CodeSentry rules", "CodeSentry secrets"])
                file_metrics.append(_empty_metrics(path, language, loc))
                continue
            valid_python.append((path, content))
            all_findings.extend(_ast_findings(path, lines, tree))
            all_findings.extend(_pyflakes_findings(path, content, lines))
            metrics = CodeMetrics()
            metrics.visit(tree)
            file_metrics.append(
                {
                    **_empty_metrics(path, language, loc),
                    "functions": metrics.functions,
                    "classes": metrics.classes,
                    "max_nesting": metrics.max_nesting,
                    "nested_loops": metrics.nested_loops,
                    "cyclomatic_complexity": metrics.complexity,
                }
            )
            add_language(language, loc, ["Python AST", "Pyflakes", "Bandit", "CodeSentry rules", "CodeSentry secrets"])
        else:
            file_metrics.append(_empty_metrics(path, language, loc))
            add_language(language, loc, ["CodeSentry rules (heuristic)", "CodeSentry secrets"])
        all_findings.extend(scan_with_rules(path, content, language))
        all_findings.extend(scan_secrets(path, content, language))

    for path, content, language in config_files:
        loc = sum(bool(line.strip()) for line in content.splitlines())
        all_findings.extend(scan_with_rules(path, content, language))
        all_findings.extend(scan_secrets(path, content, language))
        add_language(language, loc, ["CodeSentry rules (heuristic)", "CodeSentry secrets"])

    bandit_status = "not_applicable"
    if valid_python:
        try:
            all_findings.extend(_run_bandit(valid_python))
            bandit_status = "completed"
        except RuntimeError as exc:
            bandit_status = "failed"
            warnings.append(str(exc))
            failures.append({"path": "*.py", "reason": str(exc)})

    dependency_findings, dependency_coverage = check_dependencies(
        manifests, client=dependency_client, enabled=dependency_scan
    )
    all_findings.extend(dependency_findings)
    if dependency_coverage["status"] == "unavailable":
        warnings.append("Dependency vulnerability lookup (OSV.dev) was unavailable; dependencies were not checked.")
    elif dependency_coverage["status"] == "disabled" and manifests:
        warnings.append("Dependency vulnerability scanning is disabled on this server.")
    if dependency_coverage["unpinned_dependencies"]:
        warnings.append(
            f"{dependency_coverage['unpinned_dependencies']} dependency declaration(s) use version ranges and could not be checked exactly; commit a lockfile for full dependency coverage."
        )

    findings = _deduplicate(all_findings)
    findings.sort(key=sort_key)

    for metric in file_metrics:
        for item in findings:
            if item["file_path"] != metric["path"]:
                continue
            if item["source"] == "bug":
                metric["bug_count"] += 1
            elif item["source"] in {"security", "dependency"}:
                metric["security_count"] += 1
            else:
                metric["quality_count"] += 1

    # ---- coverage ----
    files_scanned = len(code_files) + len(config_files)
    countable_gaps = skipped["unsupported_type"] + skipped["oversized"] + skipped["not_utf8"] + skipped["limit_exceeded"]
    failure_files = len([item for item in failures if item["path"] != "*.py"])
    denominator = files_scanned + countable_gaps
    ratio = round((files_scanned - failure_files) / denominator, 3) if denominator else 0.0
    if bandit_status == "failed":
        ratio = min(ratio, 0.5)
    if dependency_coverage["status"] in {"unavailable", "partial"}:
        ratio = min(ratio, 0.9)
    coverage_status = "complete" if ratio >= 0.999 else "partial" if ratio >= 0.5 else "minimal"
    if files_scanned == 0:
        coverage_status = "none"
    coverage = {
        "repository_files": repository_file_count if repository_file_count is not None else len(source_files),
        "files_scanned": files_scanned,
        "code_files_scanned": len(code_files),
        "config_files_scanned": len(config_files),
        "dependency_manifests": len(manifests),
        "files_skipped": sum(skipped.values()),
        "skipped": skipped,
        "skipped_examples": examples[:MAX_SKIPPED_EXAMPLES],
        "unsupported_languages": dict(unsupported_languages),
        "analysis_failures": failures,
        "bandit_status": bandit_status,
        "dependency_scan": dependency_coverage,
        "coverage_ratio": ratio,
        "coverage_status": coverage_status,
        "languages": {
            language: {"files": stat["files"], "loc": stat["loc"], "analyzers": sorted(stat["analyzers"])}
            for language, stat in sorted(language_stats.items())
        },
    }

    # ---- risk ----
    security_items = [item for item in findings if item["source"] in {"security", "dependency"}]
    points = _risk_points(findings)
    risk_score = _score(points)
    risk_label = _label(risk_score, findings)
    counts = Counter(item["severity"] for item in findings)
    source_counts = Counter(item["source"] for item in findings)
    category_counts = Counter(item["category"] for item in security_items)
    weighted_quality = sum(QUALITY_POINTS.get(item["severity"], 0) for item in findings)
    quality_score = max(0, round(100 - (weighted_quality * 100 / max(total_loc, 1)))) if total_loc else 100

    reasons = [
        f"{counts[severity]} {severity.lower()} severity finding(s)"
        for severity in ("CRITICAL", "HIGH", "MEDIUM", "LOW")
        if counts.get(severity)
    ]
    reasons.extend(f"{count} × {category}" for category, count in category_counts.most_common(3))
    if coverage_status != "complete" and files_scanned:
        reasons.append(f"Coverage is {coverage_status} ({round(ratio * 100)}% of analyzable files fully scanned).")

    predictions: list[dict[str, Any]] = []
    for metric in file_metrics + [
        _empty_metrics(path, language, 0) for path, _, language in config_files
    ]:
        file_items = [item for item in findings if item["file_path"] == metric["path"]]
        if not file_items and metric["loc"] == 0:
            continue
        file_score = _score(_risk_points(file_items))
        predictions.append(
            {
                "path": metric["path"],
                "risk_score": file_score,
                "risk_label": _label(file_score, file_items),
                "top_features": [
                    f"{count} {severity.lower()} finding(s)"
                    for severity, count in Counter(item["severity"] for item in file_items).most_common(4)
                ]
                or ["No findings reported by the configured scanners."],
            }
        )
    predictions.sort(key=lambda item: -item["risk_score"])

    findings_truncated = len(findings) > MAX_RETURNED_FINDINGS
    if findings_truncated:
        warnings.append(
            f"Returned the {MAX_RETURNED_FINDINGS} highest-severity findings out of {len(findings)} total."
        )
    reported = findings[:MAX_RETURNED_FINDINGS]
    code_languages = {language for _, _, language in code_files}
    total_language_loc = sum(stat["loc"] for language, stat in language_stats.items() if language in code_languages) or 1
    analyzers_used = sorted({item for stat in language_stats.values() for item in stat["analyzers"]} | ({"OSV.dev"} if manifests and dependency_scan else set()))
    security_status = _security_status(risk_label, security_items, coverage)

    return {
        "analysis_id": str(uuid.uuid4()),
        "scan_id": "",
        "repo_url": repo_url,
        "repo_name": repo_name,
        "branch": branch,
        "commit_sha": commit_sha,
        "timestamp": started.isoformat(),
        "created_at": started.isoformat(),
        "settings_used": {
            "analyzers": analyzers_used,
            "risk_model": "transparent-rule-based",
            "ml_model_trained": False,
        },
        "files": all_paths,
        "languages_detected": {
            language: {
                "files": stat["files"],
                "loc": stat["loc"],
                "percentage": round(stat["loc"] * 100 / total_language_loc, 1),
            }
            for language, stat in sorted(language_stats.items())
            if language in code_languages
        },
        "findings": reported,
        "total_findings": len(findings),
        "findings_truncated": findings_truncated,
        "source_counts": dict(source_counts),
        "category_counts": dict(category_counts),
        "file_metrics": file_metrics,
        "predictions": predictions,
        "quality_score": float(quality_score),
        "risk_score": float(risk_score),
        "risk_label": risk_label,
        "risk_points": round(points, 2),
        "risk_breakdown": {
            "security": _score(_risk_points([i for i in findings if i["source"] == "security"])),
            "dependencies": _score(_risk_points([i for i in findings if i["source"] == "dependency"])),
            "bugs": _score(_risk_points([i for i in findings if i["source"] == "bug"])),
            "complexity": _score(_risk_points([i for i in findings if i["source"] == "quality"])),
            "quality": 100 - quality_score,
        },
        "risk_reasons": reasons or ["No findings were reported by the configured scanners."],
        "risk_model": "transparent-rule-based (no trained ML model configured)",
        "risk_explanation": RISK_MODEL_DESCRIPTION,
        "security_status": security_status,
        "coverage": coverage,
        "duration_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 3),
        "warnings": warnings,
        "logs": [
            f"Scanned {files_scanned} file(s): {len(code_files)} source, {len(config_files)} configuration/manifest.",
            f"Python: {len(valid_python)} syntax-valid file(s) analysed with AST, Pyflakes and Bandit ({bandit_status}).",
            f"Dependency check: {dependency_coverage['status']} ({dependency_coverage['packages_checked']} pinned package(s) checked).",
            f"Skipped {sum(skipped.values())} file(s); coverage {coverage_status} ({round(ratio * 100)}%).",
            f"Findings: {len(findings)} total ({len(security_items)} security/dependency).",
        ],
        "file_count": files_scanned,
        "python_file_count": sum(1 for _, _, language in code_files if language == "Python"),
        "severity_counts": {severity: counts.get(severity, 0) for severity in SEVERITY_ORDER},
        "ai_review": {"status": "not_requested", "reason": None, "recommendations": [], "findings": {}},
    }
