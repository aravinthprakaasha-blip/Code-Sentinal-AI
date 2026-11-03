"""Dependency vulnerability lookup against the OSV.dev database.

Only exactly pinned versions can be checked reliably. Range specifiers such as
``^1.2.0`` or ``>=2`` are counted as "unpinned" and reported in coverage rather
than guessed. OSV.dev is a free public API that needs no key.
"""

from __future__ import annotations

import json
import logging
import re
import tomllib
from typing import Any

import httpx

from backend import findings as F

logger = logging.getLogger(__name__)
OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
OSV_VULN_URL = "https://api.osv.dev/v1/vulns/{}"
MAX_PACKAGES = 1000
MAX_VULN_DETAILS = 60

MANIFEST_NAMES = {
    "requirements.txt",
    "requirements-dev.txt",
    "requirements-prod.txt",
    "package.json",
    "package-lock.json",
    "poetry.lock",
    "pipfile.lock",
}


def is_manifest(path: str) -> bool:
    name = path.rsplit("/", 1)[-1].lower()
    return name in MANIFEST_NAMES or (name.startswith("requirements") and name.endswith(".txt"))


_REQ_LINE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9.+!_-]+)\s*(?:[;#].*)?$")
_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")
_EXACT_NPM = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")


def _line_of(content: str, needle: str) -> int:
    for index, line in enumerate(content.splitlines(), start=1):
        if needle in line:
            return index
    return 1


def parse_manifest(path: str, content: str) -> tuple[list[dict[str, Any]], int]:
    """Return (pinned packages, number of unpinned/unsupported entries)."""
    name = path.rsplit("/", 1)[-1].lower()
    packages: list[dict[str, Any]] = []
    unpinned = 0
    try:
        if name.startswith("requirements") and name.endswith(".txt"):
            for index, line in enumerate(content.splitlines(), start=1):
                stripped = line.strip()
                if not stripped or stripped.startswith(("#", "-")):
                    continue
                match = _REQ_LINE.match(stripped)
                if match:
                    packages.append({"name": match.group(1), "version": match.group(2), "ecosystem": "PyPI", "line": index})
                elif _REQ_NAME.match(stripped):
                    unpinned += 1
        elif name == "package-lock.json":
            data = json.loads(content)
            entries = data.get("packages")
            if isinstance(entries, dict):
                for key, value in entries.items():
                    if not key or not isinstance(value, dict) or value.get("link"):
                        continue
                    package_name = value.get("name") or key.split("node_modules/")[-1]
                    version = value.get("version")
                    if isinstance(version, str) and _EXACT_NPM.match(version):
                        packages.append({"name": package_name, "version": version, "ecosystem": "npm", "line": _line_of(content, f'"{key}"')})
            elif isinstance(data.get("dependencies"), dict):
                for package_name, value in data["dependencies"].items():
                    version = value.get("version") if isinstance(value, dict) else None
                    if isinstance(version, str) and _EXACT_NPM.match(version):
                        packages.append({"name": package_name, "version": version, "ecosystem": "npm", "line": _line_of(content, f'"{package_name}"')})
        elif name == "package.json":
            data = json.loads(content)
            for section in ("dependencies", "devDependencies", "optionalDependencies"):
                deps = data.get(section)
                if not isinstance(deps, dict):
                    continue
                for package_name, spec in deps.items():
                    if isinstance(spec, str) and _EXACT_NPM.match(spec.strip()):
                        packages.append({"name": package_name, "version": spec.strip(), "ecosystem": "npm", "line": _line_of(content, f'"{package_name}"')})
                    else:
                        unpinned += 1
        elif name == "poetry.lock":
            data = tomllib.loads(content)
            for item in data.get("package", []):
                if isinstance(item, dict) and item.get("name") and item.get("version"):
                    packages.append({"name": item["name"], "version": str(item["version"]), "ecosystem": "PyPI", "line": _line_of(content, f'name = "{item["name"]}"')})
        elif name == "pipfile.lock":
            data = json.loads(content)
            for section in ("default", "develop"):
                for package_name, value in (data.get(section) or {}).items():
                    version = value.get("version", "") if isinstance(value, dict) else ""
                    if isinstance(version, str) and version.startswith("=="):
                        packages.append({"name": package_name, "version": version[2:], "ecosystem": "PyPI", "line": _line_of(content, f'"{package_name}"')})
    except (ValueError, tomllib.TOMLDecodeError, AttributeError, TypeError):
        logger.info("Could not parse dependency manifest %s", path)
        raise ValueError(f"Could not parse dependency manifest {path}.") from None
    return packages, unpinned


def _osv_severity(vuln: dict[str, Any]) -> str:
    database_specific = vuln.get("database_specific") or {}
    label = str(database_specific.get("severity", "")).upper()
    mapping = {"CRITICAL": "CRITICAL", "HIGH": "HIGH", "MODERATE": "MEDIUM", "MEDIUM": "MEDIUM", "LOW": "LOW"}
    if label in mapping:
        return mapping[label]
    for affected in vuln.get("affected", []) or []:
        eco = (affected.get("ecosystem_specific") or {}).get("severity")
        if isinstance(eco, str) and eco.upper() in mapping:
            return mapping[eco.upper()]
    return "MEDIUM"


def _fixed_versions(vuln: dict[str, Any], package_name: str) -> list[str]:
    fixed: list[str] = []
    for affected in vuln.get("affected", []) or []:
        if (affected.get("package") or {}).get("name", "").lower() != package_name.lower():
            continue
        for range_item in affected.get("ranges", []) or []:
            for event in range_item.get("events", []) or []:
                if "fixed" in event:
                    fixed.append(str(event["fixed"]))
    return sorted(set(fixed))[:5]


def check_dependencies(
    manifests: list[tuple[str, str]],
    client: httpx.Client | None = None,
    enabled: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Look up pinned dependencies in OSV.dev.

    Returns (findings, coverage). Coverage ``status`` is one of
    ``not_applicable``, ``disabled``, ``completed``, ``partial``, ``unavailable``.
    """
    coverage: dict[str, Any] = {
        "status": "not_applicable",
        "manifests": [path for path, _ in manifests],
        "packages_checked": 0,
        "unpinned_dependencies": 0,
        "vulnerable_packages": 0,
        "parse_errors": [],
        "source": "OSV.dev",
    }
    if not manifests:
        return [], coverage
    if not enabled:
        coverage["status"] = "disabled"
        return [], coverage

    packages: list[dict[str, Any]] = []
    paths_with_lock = {path.rsplit("/", 1)[0] if "/" in path else "" for path, _ in manifests if path.lower().endswith("package-lock.json")}
    for path, content in manifests:
        directory = path.rsplit("/", 1)[0] if "/" in path else ""
        if path.lower().endswith("package.json") and directory in paths_with_lock:
            continue  # the lockfile has the exact resolved versions
        try:
            parsed, unpinned = parse_manifest(path, content)
        except ValueError as exc:
            coverage["parse_errors"].append(str(exc))
            continue
        coverage["unpinned_dependencies"] += unpinned
        for package in parsed:
            package["manifest"] = path
        packages.extend(parsed)

    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for package in packages:
        unique.setdefault((package["ecosystem"], package["name"].lower(), package["version"]), package)
    queried = list(unique.values())[:MAX_PACKAGES]
    if not queried:
        coverage["status"] = "completed" if not coverage["parse_errors"] else "partial"
        return [], coverage

    owns_client = client is None
    client = client or httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0))
    results: list[dict[str, Any]] = []
    try:
        response = client.post(
            OSV_BATCH_URL,
            json={"queries": [{"package": {"name": p["name"], "ecosystem": p["ecosystem"]}, "version": p["version"]} for p in queried]},
        )
        response.raise_for_status()
        batch = response.json().get("results", [])
        coverage["packages_checked"] = len(queried)
        details: dict[str, dict[str, Any]] = {}
        vulnerable: list[tuple[dict[str, Any], list[str]]] = []
        for package, result in zip(queried, batch):
            ids = [item.get("id") for item in (result or {}).get("vulns", []) or [] if item.get("id")]
            if ids:
                vulnerable.append((package, ids))
        coverage["vulnerable_packages"] = len(vulnerable)
        for _, ids in vulnerable:
            for vuln_id in ids:
                if vuln_id in details or len(details) >= MAX_VULN_DETAILS:
                    continue
                try:
                    detail = client.get(OSV_VULN_URL.format(vuln_id))
                    detail.raise_for_status()
                    details[vuln_id] = detail.json()
                except (httpx.HTTPError, ValueError):
                    details[vuln_id] = {"id": vuln_id}
        for package, ids in vulnerable:
            for vuln_id in ids:
                vuln = details.get(vuln_id, {"id": vuln_id})
                aliases = [alias for alias in vuln.get("aliases", []) or [] if isinstance(alias, str)]
                fixed = _fixed_versions(vuln, package["name"])
                summary = str(vuln.get("summary") or vuln.get("details") or "Known vulnerability")[:300]
                identifier = next((alias for alias in aliases if alias.startswith("CVE-")), vuln_id)
                cwe_ids = (vuln.get("database_specific") or {}).get("cwe_ids") or []
                results.append(
                    F.make_finding(
                        source="dependency",
                        rule_id=vuln_id,
                        title=f"{package['name']} {package['version']}: {identifier}",
                        file_path=package["manifest"],
                        line=package.get("line", 1),
                        severity=_osv_severity(vuln),
                        confidence="HIGH",
                        description=f"{summary} (affects {package['ecosystem']} package {package['name']} {package['version']}).",
                        suggested_fix=(
                            f"Upgrade {package['name']} to a fixed version ({', '.join(fixed)})."
                            if fixed else f"Upgrade {package['name']} or replace it; check the advisory for a fixed release."
                        ),
                        is_heuristic=False,
                        snippet=f"{package['name']}=={package['version']}",
                        language=package["ecosystem"],
                        category=F.DEPENDENCY,
                        analyzer="OSV.dev",
                        cwe=cwe_ids[0] if cwe_ids and isinstance(cwe_ids[0], str) else None,
                        references=[f"https://osv.dev/vulnerability/{vuln_id}"],
                    )
                )
        coverage["status"] = "partial" if coverage["parse_errors"] or len(unique) > MAX_PACKAGES else "completed"
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("OSV dependency lookup unavailable: %s", type(exc).__name__)
        coverage["status"] = "unavailable"
        coverage["packages_checked"] = 0
    finally:
        if owns_client:
            client.close()
    return results, coverage
