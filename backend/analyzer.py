from __future__ import annotations

import ast
import io
import json
import logging
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

logger = logging.getLogger(__name__)
SKIP_PATH_PARTS = {".git", "node_modules", "venv", ".venv", "__pycache__", "site-packages"}
SEVERITY_POINTS = {"CRITICAL": 25, "HIGH": 15, "MEDIUM": 7, "LOW": 2, "INFORMATIONAL": 0}
SEVERITY_ORDER = {"INFORMATIONAL": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
MAX_RETURNED_FINDINGS = 250


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


def _finding(
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
    cwe: str | None = None,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "source": source,
        "rule_id": rule_id,
        "title": title,
        "file_path": file_path,
        "language": "Python",
        "line_start": max(1, line),
        "line_end": max(1, line),
        "severity": severity,
        "confidence": confidence,
        "description": description,
        "suggested_fix": suggested_fix,
        "is_heuristic": is_heuristic,
        "snippet": snippet[:1000],
        "cwe": cwe,
    }


def _line_snippet(lines: list[str], line: int) -> str:
    return lines[line - 1].strip() if 0 < line <= len(lines) else ""


def _pyflakes_findings(path: str, content: str, lines: list[str]) -> list[dict[str, Any]]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    reporter = Reporter(stdout, stderr)
    try:
        pyflakes_api.check(content, path, reporter)
    except Exception:
        logger.exception("Pyflakes analysis failed for %s", path)
        return []

    findings: list[dict[str, Any]] = []
    for output in stdout.getvalue().splitlines():
        match = re.match(r"^.*?:(\d+):\s*(.*)$", output)
        if not match:
            continue
        line = int(match.group(1))
        message = match.group(2)
        if "undefined name" in message or "cannot import name" in message:
            rule, title, severity, confidence, heuristic, fix = (
                "PY-UNDEFINED",
                "Undefined name or import",
                "HIGH",
                "HIGH",
                False,
                "Define the name or correct the import to a module member that exists.",
            )
        elif "imported but unused" in message or "assigned to but never used" in message:
            rule, title, severity, confidence, heuristic, fix = (
                "PY-UNUSED",
                "Unused import or variable",
                "LOW",
                "HIGH",
                False,
                "Remove the unused binding or use it intentionally.",
            )
        elif "redefinition" in message:
            rule, title, severity, confidence, heuristic, fix = (
                "PY-REDEFINITION",
                "Name redefined",
                "MEDIUM",
                "HIGH",
                False,
                "Rename or remove the redefined binding.",
            )
        else:
            continue
        findings.append(
            _finding(
                source="bug",
                rule_id=rule,
                title=title,
                file_path=path,
                line=line,
                severity=severity,
                confidence=confidence,
                description=message,
                suggested_fix=fix,
                is_heuristic=heuristic,
                snippet=_line_snippet(lines, line),
            )
        )
    return findings


def _ast_findings(path: str, lines: list[str], tree: ast.Module) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end_line = getattr(node, "end_lineno", node.lineno)
            if end_line - node.lineno + 1 > 50:
                findings.append(
                    _finding(
                        source="quality",
                        rule_id="PY-FUNCTION-LENGTH",
                        title="Long function",
                        file_path=path,
                        line=node.lineno,
                        severity="LOW",
                        confidence="HIGH",
                        description=f"Function spans {end_line - node.lineno + 1} lines; large functions are harder to review and test.",
                        suggested_fix="Split the function into smaller, cohesive helpers.",
                        is_heuristic=True,
                        snippet=_line_snippet(lines, node.lineno),
                    )
                )
            defaults = node.args.defaults + node.args.kw_defaults
            for default in defaults:
                if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                    findings.append(
                        _finding(
                            source="bug",
                            rule_id="PY-MUTABLE-DEFAULT",
                            title="Mutable default argument",
                            file_path=path,
                            line=default.lineno,
                            severity="MEDIUM",
                            confidence="HIGH",
                            description="Mutable default values are shared between calls to this function.",
                            suggested_fix="Use None as the default and create the mutable value inside the function.",
                            is_heuristic=False,
                            snippet=_line_snippet(lines, default.lineno),
                        )
                    )
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            findings.append(
                _finding(
                    source="bug",
                    rule_id="PY-BARE-EXCEPT",
                    title="Bare exception handler",
                    file_path=path,
                    line=node.lineno,
                    severity="MEDIUM",
                    confidence="HIGH",
                    description="A bare except catches system-exiting exceptions as well as application errors.",
                    suggested_fix="Catch the specific exception types expected from this operation.",
                    is_heuristic=False,
                    snippet=_line_snippet(lines, node.lineno),
                )
            )
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
            if isinstance(node.right, ast.Constant) and node.right.value == 0:
                findings.append(
                    _finding(
                        source="bug",
                        rule_id="PY-DIV-ZERO",
                        title="Division by literal zero",
                        file_path=path,
                        line=node.lineno,
                        severity="HIGH",
                        confidence="HIGH",
                        description="A division operation uses a literal zero denominator.",
                        suggested_fix="Correct the denominator or validate it before division.",
                        is_heuristic=False,
                        snippet=_line_snippet(lines, node.lineno),
                    )
                )
    metrics = CodeMetrics()
    metrics.visit(tree)
    if metrics.complexity > 15:
        findings.append(
            _finding(
                source="quality",
                rule_id="PY-COMPLEXITY",
                title="High cyclomatic complexity",
                file_path=path,
                line=1,
                severity="MEDIUM",
                confidence="HIGH",
                description=f"File-level cyclomatic complexity is {metrics.complexity}, above the maintainability threshold of 15.",
                suggested_fix="Split complex branching into smaller functions and simplify conditional logic.",
                is_heuristic=True,
                snippet=_line_snippet(lines, 1),
            )
        )
    return findings


def _run_bandit(files: list[tuple[str, str]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if not files:
        return findings
    with tempfile.TemporaryDirectory(prefix="codesentry-bandit-") as temp_dir:
        root = Path(temp_dir).resolve()
        source_paths: dict[str, tuple[str, list[str]]] = {}
        for index, (relative_path, content) in enumerate(files):
            safe = _safe_path(relative_path)
            path = root / f"{index}.py"
            path.write_text(content, encoding="utf-8")
            source_paths[str(path)] = (safe, content.splitlines())
        try:
            result = subprocess.run(
                [sys.executable, "-m", "bandit", "-f", "json", "-q", *source_paths],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
                shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            logger.warning("Bandit exceeded its 60-second timeout")
            raise RuntimeError("Security analysis timed out.") from exc
        if result.returncode not in {0, 1}:
            logger.error("Bandit failed with exit code %s: %s", result.returncode, result.stderr[:1000])
            raise RuntimeError("Security scanner failed to complete.")
        try:
            output = json.loads(result.stdout or "{}")
        except json.JSONDecodeError as exc:
            logger.exception("Bandit returned invalid JSON")
            raise RuntimeError("Security scanner returned an invalid response.") from exc
        path_map = {Path(key).name: value for key, value in source_paths.items()}
        for item in output.get("results", []):
            relative_path, lines = path_map[Path(item["filename"]).name]
            line = int(item.get("line_number", 1))
            bandit_severity = str(item.get("issue_severity", "LOW")).upper()
            severity = (
                bandit_severity
                if bandit_severity in {"INFORMATIONAL", "LOW", "MEDIUM", "HIGH", "CRITICAL"}
                else "LOW"
            )
            bandit_confidence = str(item.get("issue_confidence", "N/A")).upper()
            confidence = (
                bandit_confidence
                if bandit_confidence in {"LOW", "MEDIUM", "HIGH"}
                else "N/A"
            )
            cwe_value = item.get("issue_cwe") or {}
            cwe = f"CWE-{cwe_value['id']}" if cwe_value.get("id") else None
            findings.append(
                _finding(
                    source="security",
                    rule_id=str(item.get("test_id", "BANDIT")),
                    title=str(item.get("test_name", "Bandit security finding")),
                    file_path=relative_path,
                    line=line,
                    severity=severity,
                    confidence=confidence,
                    description=str(item.get("issue_text", "")),
                    suggested_fix="Review the flagged operation and apply the mitigation documented for this Bandit rule.",
                    is_heuristic=False,
                    snippet=_line_snippet(lines, line),
                    cwe=cwe,
                )
            )
    return findings


def analyze_files(
    source_files: list[dict[str, str]], repo_url: str, repo_name: str, branch: str
) -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    normalized_files: list[tuple[str, str]] = []
    warnings: list[str] = []
    for file in source_files:
        path = _safe_path(file["path"])
        if not path.lower().endswith((".py", ".pyi")):
            warnings.append(f"Skipped non-Python file: {path}")
            continue
        normalized_files.append((path, file["content"]))

    findings: list[dict[str, Any]] = []
    file_metrics: list[dict[str, Any]] = []
    valid_files: list[tuple[str, str]] = []
    total_loc = 0
    for path, content in normalized_files:
        lines = content.splitlines()
        loc = sum(bool(line.strip()) for line in lines)
        total_loc += loc
        try:
            tree = ast.parse(content, filename=path)
        except SyntaxError as exc:
            line = exc.lineno or 1
            findings.append(
                _finding(
                    source="bug",
                    rule_id="PY-SYNTAX",
                    title="Python syntax error",
                    file_path=path,
                    line=line,
                    severity="HIGH",
                    confidence="HIGH",
                    description=f"Python could not parse this file: {exc.msg}. This is a parse-time error, not a runtime error.",
                    suggested_fix="Correct the indicated syntax before running or analyzing this module.",
                    is_heuristic=False,
                    snippet=_line_snippet(lines, line),
                )
            )
            warnings.append(f"Skipped semantic and Bandit analysis for syntax-invalid file: {path}")
            continue
        valid_files.append((path, content))
        findings.extend(_ast_findings(path, lines, tree))
        findings.extend(_pyflakes_findings(path, content, lines))
        metrics = CodeMetrics()
        metrics.visit(tree)
        file_metrics.append(
            {
                "path": path,
                "language": "Python",
                "loc": loc,
                "functions": metrics.functions,
                "classes": metrics.classes,
                "max_nesting": metrics.max_nesting,
                "nested_loops": metrics.nested_loops,
                "cyclomatic_complexity": metrics.complexity,
                "bug_count": 0,
                "security_count": 0,
                "quality_count": 0,
            }
        )
    try:
        findings.extend(_run_bandit(valid_files))
    except RuntimeError as exc:
        warnings.append(str(exc))

    for metric in file_metrics:
        metric["bug_count"] = sum(
            finding["source"] == "bug" and finding["file_path"] == metric["path"]
            for finding in findings
        )
        metric["security_count"] = sum(
            finding["source"] == "security" and finding["file_path"] == metric["path"]
            for finding in findings
        )
        metric["quality_count"] = sum(
            finding["source"] == "quality" and finding["file_path"] == metric["path"]
            for finding in findings
        )

    counts = Counter(finding["severity"] for finding in findings)
    weighted_findings = sum(SEVERITY_POINTS.get(f["severity"], 0) for f in findings)
    security_findings = [f for f in findings if f["source"] == "security"]
    risk_score = min(
        100,
        round(
            sum(SEVERITY_POINTS.get(f["severity"], 0) for f in security_findings) * 2.2
            + sum(SEVERITY_POINTS.get(f["severity"], 0) for f in findings if f["source"] == "bug") * 1.5
            + sum(max(0, metric["cyclomatic_complexity"] - 10) for metric in file_metrics) * 0.6
            + sum(metric["nested_loops"] for metric in file_metrics) * 4
        ),
    )
    quality_score = max(0, round(100 - (weighted_findings * 100 / max(total_loc, 1))))
    if risk_score >= 80:
        risk_label = "CRITICAL"
    elif risk_score >= 60:
        risk_label = "HIGH"
    elif risk_score >= 30:
        risk_label = "MEDIUM"
    else:
        risk_label = "LOW"
    top_reasons = [
        f"{count} {severity.lower()} severity finding(s)"
        for severity, count in sorted(counts.items(), key=lambda item: SEVERITY_ORDER[item[0]], reverse=True)
        if count
    ][:4]
    if any(metric["cyclomatic_complexity"] > 15 for metric in file_metrics):
        top_reasons.append("One or more files have high cyclomatic complexity.")
    if any(metric["nested_loops"] for metric in file_metrics):
        top_reasons.append("Nested loops increase execution-time risk.")
    predictions: list[dict[str, Any]] = []
    for metric in file_metrics:
        file_findings = [f for f in findings if f["file_path"] == metric["path"]]
        file_score = min(
            100,
            round(
                sum(SEVERITY_POINTS.get(f["severity"], 0) for f in file_findings if f["source"] == "security") * 2.2
                + sum(SEVERITY_POINTS.get(f["severity"], 0) for f in file_findings if f["source"] == "bug") * 1.5
                + max(0, metric["cyclomatic_complexity"] - 10) * 0.6
                + metric["nested_loops"] * 4
            ),
        )
        file_label = "HIGH" if file_score >= 60 else "MEDIUM" if file_score >= 30 else "LOW"
        predictions.append(
            {
                "path": metric["path"],
                "risk_score": file_score,
                "risk_label": file_label,
                "top_features": [
                    text
                    for text, active in (
                        (f"{metric['security_count']} security finding(s)", metric["security_count"] > 0),
                        (f"{metric['bug_count']} bug finding(s)", metric["bug_count"] > 0),
                        (f"Cyclomatic complexity {metric['cyclomatic_complexity']}", metric["cyclomatic_complexity"] > 10),
                        (f"{metric['nested_loops']} nested loop(s)", metric["nested_loops"] > 0),
                    )
                    if active
                ][:4]
                or ["No elevated static-analysis factors detected."],
            }
        )
    source_counts = Counter(finding["source"] for finding in findings)
    findings_truncated = len(findings) > MAX_RETURNED_FINDINGS
    if findings_truncated:
        findings.sort(
            key=lambda finding: (
                -SEVERITY_ORDER.get(finding["severity"], 0),
                finding["file_path"],
                finding["line_start"],
                finding["rule_id"],
            )
        )
        warnings.append(
            f"Returned the {MAX_RETURNED_FINDINGS} highest-severity findings out of {len(findings)} total."
        )
    reported_findings = findings[:MAX_RETURNED_FINDINGS]
    return {
        "analysis_id": str(uuid.uuid4()),
        "scan_id": "",
        "repo_url": repo_url,
        "repo_name": repo_name,
        "branch": branch,
        "commit_sha": "unknown",
        "timestamp": started.isoformat(),
        "created_at": started.isoformat(),
        "settings_used": {
            "analyzers": ["Python AST", "Pyflakes", "Bandit"],
            "risk_model": "transparent-rule-based",
            "ml_model_trained": False,
        },
        "files": [path for path, _ in normalized_files],
        "languages_detected": {
            "Python": {
                "files": len(normalized_files),
                "loc": total_loc,
                "percentage": 100.0 if valid_files else 0.0,
            }
        } if valid_files else {},
        "findings": reported_findings,
        "total_findings": len(findings),
        "findings_truncated": findings_truncated,
        "source_counts": dict(source_counts),
        "file_metrics": file_metrics,
        "predictions": predictions,
        "quality_score": float(quality_score),
        "risk_score": float(risk_score),
        "risk_label": risk_label,
        "risk_breakdown": {
            "security": min(100, round(sum(SEVERITY_POINTS.get(f["severity"], 0) for f in security_findings) * 2.2)),
            "bugs": min(100, round(sum(SEVERITY_POINTS.get(f["severity"], 0) for f in findings if f["source"] == "bug") * 1.5)),
            "complexity": min(100, round(
                sum(max(0, metric["cyclomatic_complexity"] - 10) * 0.6 + metric["nested_loops"] * 4
                    for metric in file_metrics)
            )),
            "quality": 100 - quality_score,
        },
        "risk_reasons": top_reasons or ["No findings were reported by the configured scanners."],
        "risk_model": "transparent-rule-based (no trained ML model configured)",
        "duration_seconds": round((datetime.now(timezone.utc) - started).total_seconds(), 3),
        "warnings": warnings,
        "logs": [
            f"Analyzed {len(valid_files)} syntax-valid Python file(s); skipped {len(normalized_files) - len(valid_files)} syntax-invalid file(s).",
            f"Findings: {len(findings)} total (Bandit security findings: {len(security_findings)}).",
        ],
        "file_count": len(normalized_files),
        "python_file_count": len(normalized_files),
        "severity_counts": {severity: counts.get(severity, 0) for severity in SEVERITY_ORDER},
        "ai_review": {"status": "not_requested", "recommendations": []},
    }
