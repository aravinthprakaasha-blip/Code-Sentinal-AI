"""
backend/models.py
=================
Shared data contracts for CodeSentry AI.
All analyzers, ML modules, AI reviewers, reporting engines, and UI pages
share these exact definitions to guarantee strong contract adherence.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Literal, Optional


SeverityLevel = Literal["LOW", "MEDIUM", "HIGH"]
ConfidenceLevel = Literal["LOW", "MEDIUM", "HIGH", "N/A"]
FindingSource = Literal["bug", "security", "quality"]
RiskLabel = Literal["LOW", "MEDIUM", "HIGH"]


@dataclass
class Finding:
    """Represents a single static or heuristic finding from an analyzer."""

    id: str
    source: FindingSource
    rule_id: str
    title: str
    file_path: str  # Repository-relative path with forward slashes
    line_start: int
    line_end: int
    severity: SeverityLevel
    confidence: ConfidenceLevel
    description: str
    suggested_fix: str
    is_heuristic: bool
    cwe: Optional[str] = None  # Populated only if the scanner (e.g. Bandit) provides it
    language: Optional[str] = None
    snippet: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert finding to standard dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Finding:
        """Create a Finding instance from a dictionary."""
        return cls(
            id=str(data["id"]),
            source=data["source"],
            rule_id=str(data["rule_id"]),
            title=str(data["title"]),
            file_path=str(data["file_path"]),
            line_start=int(data["line_start"]),
            line_end=int(data["line_end"]),
            severity=data["severity"],
            confidence=data["confidence"],
            description=str(data["description"]),
            suggested_fix=str(data["suggested_fix"]),
            is_heuristic=_parse_bool(data["is_heuristic"], "is_heuristic"),
            cwe=data.get("cwe"),
            language=data.get("language"),
            snippet=data.get("snippet"),
        )


@dataclass
class FileMetrics:
    """Quantitative complexity and issue counts per file."""

    path: str  # Repository-relative path
    loc: int  # Non-empty lines of code
    functions: int
    classes: int
    max_nesting: int
    nested_loops: int
    cyclomatic_complexity: int
    bug_count: int
    security_count: int
    quality_count: int
    language: str = "Other"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> FileMetrics:
        return cls(
            path=str(data["path"]),
            loc=int(data["loc"]),
            functions=int(data["functions"]),
            classes=int(data["classes"]),
            max_nesting=int(data["max_nesting"]),
            nested_loops=int(data["nested_loops"]),
            cyclomatic_complexity=int(data["cyclomatic_complexity"]),
            bug_count=int(data["bug_count"]),
            security_count=int(data["security_count"]),
            quality_count=int(data["quality_count"]),
            language=str(data.get("language", "Other")),
        )


@dataclass
class LanguageStat:
    """File and line counts for one detected programming language."""

    files: int
    loc: int
    percentage: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> LanguageStat:
        return cls(
            files=int(data["files"]),
            loc=int(data["loc"]),
            percentage=float(data["percentage"]),
        )


@dataclass
class FilePrediction:
    """ML Risk classification output for a single Python file."""

    path: str
    risk_label: RiskLabel
    probabilities: Dict[str, float]  # E.g. {"LOW": 0.85, "MEDIUM": 0.10, "HIGH": 0.05}
    top_features: List[str]  # Prominent contributing features relative to baseline

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> FilePrediction:
        return cls(
            path=str(data["path"]),
            risk_label=data["risk_label"],
            probabilities={k: float(v) for k, v in data["probabilities"].items()},
            top_features=list(data.get("top_features", [])),
        )


@dataclass
class AIReview:
    """Structured LLM code review suggestion with patch diff capabilities."""

    finding_ids: List[str]
    explanation: str
    why_problematic: str
    impact: str
    original_snippet: str
    corrected_snippet: str
    change_explanation: str
    prevention: str
    disclaimer: str = (
        "AI-generated suggestion. Review, verify, and test thoroughly before applying."
    )
    isValidSyntax: Optional[bool] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> AIReview:
        return cls(
            finding_ids=list(data.get("finding_ids", [])),
            explanation=str(data.get("explanation", "")),
            why_problematic=str(data.get("why_problematic", "")),
            impact=str(data.get("impact", "")),
            original_snippet=str(data.get("original_snippet", "")),
            corrected_snippet=str(data.get("corrected_snippet", "")),
            change_explanation=str(data.get("change_explanation", "")),
            prevention=str(data.get("prevention", "")),
            isValidSyntax=(
                _parse_bool(data["isValidSyntax"], "isValidSyntax")
                if "isValidSyntax" in data
                else None
            ),
            disclaimer=str(
                data.get(
                    "disclaimer",
                    "AI-generated suggestion. Review, verify, and test thoroughly before applying.",
                )
            ),
        )


@dataclass
class ScanResult:
    """Comprehensive artifact resulting from a full repository scan."""

    scan_id: str
    repo_url: str
    repo_name: str
    branch: str
    commit_sha: str
    timestamp: str  # ISO 8601 UTC string
    settings_used: Dict[str, Any]
    files: List[str]  # List of scanned repo-relative paths
    findings: List[Finding] = field(default_factory=list)
    file_metrics: List[FileMetrics] = field(default_factory=list)
    predictions: List[FilePrediction] = field(default_factory=list)
    quality_score: float = 100.0  # 0 to 100
    risk_score: float = 0.0  # 0 to 100
    risk_breakdown: Dict[str, float] = field(default_factory=dict)
    duration_seconds: float = 0.0
    warnings: List[str] = field(default_factory=list)
    languages_detected: Dict[str, LanguageStat] = field(default_factory=dict)
    logs: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scan_id": self.scan_id,
            "repo_url": self.repo_url,
            "repo_name": self.repo_name,
            "branch": self.branch,
            "commit_sha": self.commit_sha,
            "timestamp": self.timestamp,
            "settings_used": self.settings_used,
            "files": self.files,
            "languages_detected": {
                language: stat.to_dict()
                for language, stat in self.languages_detected.items()
            },
            "findings": [f.to_dict() for f in self.findings],
            "file_metrics": [m.to_dict() for m in self.file_metrics],
            "predictions": [p.to_dict() for p in self.predictions],
            "quality_score": round(self.quality_score, 2),
            "risk_score": round(self.risk_score, 2),
            "risk_breakdown": {k: round(v, 2) for k, v in self.risk_breakdown.items()},
            "duration_seconds": round(self.duration_seconds, 2),
            "warnings": self.warnings,
            "logs": self.logs,
        }

    def to_json(self, indent: Optional[int] = 2) -> str:
        """Serialize scan result to formatted JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ScanResult:
        return cls(
            scan_id=str(data["scan_id"]),
            repo_url=str(data["repo_url"]),
            repo_name=str(data["repo_name"]),
            branch=str(data.get("branch", "main")),
            commit_sha=str(data.get("commit_sha", "unknown")),
            timestamp=str(data["timestamp"]),
            settings_used=dict(data.get("settings_used", {})),
            files=list(data.get("files", [])),
            languages_detected={
                language: LanguageStat.from_dict(stat)
                for language, stat in data.get("languages_detected", {}).items()
            },
            findings=[Finding.from_dict(f) for f in data.get("findings", [])],
            file_metrics=[FileMetrics.from_dict(m) for m in data.get("file_metrics", [])],
            predictions=[FilePrediction.from_dict(p) for p in data.get("predictions", [])],
            quality_score=float(data.get("quality_score", 100.0)),
            risk_score=float(data.get("risk_score", 0.0)),
            risk_breakdown={k: float(v) for k, v in data.get("risk_breakdown", {}).items()},
            duration_seconds=float(data.get("duration_seconds", 0.0)),
            warnings=list(data.get("warnings", [])),
            logs=list(data.get("logs", [])),
        )

    @classmethod
    def from_json(cls, json_str: str) -> ScanResult:
        """Deserialize scan result from JSON string."""
        return cls.from_dict(json.loads(json_str))


def _parse_bool(value: Any, field_name: str) -> bool:
    if not isinstance(value, bool):
        raise TypeError(f"{field_name} must be a boolean")
    return value
