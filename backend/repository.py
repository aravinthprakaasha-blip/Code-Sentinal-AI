"""GitHub repository retrieval.

Security model
--------------
* Repository code is downloaded as text and never executed or cloned.
* Public repositories may use the server's optional ``GITHUB_TOKEN`` purely to
  raise rate limits. The server token is NEVER used to read a private
  repository: otherwise any signed-in user could read whatever the server
  owner's token can see.
* Private repositories require the user's own token, supplied per request.
  GitHub then enforces that user's permissions. The token is used only for the
  duration of the request; it is not stored, logged, or returned.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import HTTPException

from backend.analyzer import classify
from backend.config import Settings

logger = logging.getLogger(__name__)
REPO_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
BRANCH_PATTERN = re.compile(r"^[A-Za-z0-9._/+-]{1,200}$")
SKIP_DIRECTORIES = {
    ".git",
    ".idea",
    ".mypy_cache",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    ".gradle",
    ".terraform",
    "__pycache__",
    "bower_components",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "site-packages",
    "target",
    "third_party",
    "vendor",
    "venv",
}
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp", ".avif", ".tif", ".tiff",
    ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war", ".ear",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".lib", ".class", ".pyc", ".pyo", ".whl",
    ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".mov",
    ".avi", ".psd", ".ai", ".sketch", ".fig", ".db", ".sqlite", ".sqlite3", ".parquet", ".pkl",
    ".h5", ".onnx", ".pt", ".npy", ".npz", ".ipynb", ".lock", ".map",
}
LOCKFILE_EXCEPTIONS = {"poetry.lock"}
LANGUAGE_EXTENSIONS = {
    ".py": "Python", ".pyi": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
    ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".go": "Go", ".rs": "Rust",
    ".java": "Java", ".kt": "Kotlin", ".c": "C", ".h": "C", ".cpp": "C++", ".cc": "C++", ".hpp": "C++",
    ".cs": "C#", ".swift": "Swift", ".php": "PHP", ".rb": "Ruby", ".sh": "Shell", ".sql": "SQL",
    ".scala": "Scala", ".dart": "Dart", ".vue": "Vue", ".svelte": "Svelte",
}
MAX_SKIPPED_EXAMPLES = 60
DOWNLOAD_WORKERS = 8


@dataclass
class RepositorySnapshot:
    repo_url: str
    owner: str
    name: str
    branch: str
    commit_sha: str
    private: bool
    files: list[dict[str, str]]
    repository_file_count: int
    languages: list[str]
    skipped: dict[str, int]
    skipped_examples: list[dict[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def parse_github_url(repository_url: str) -> tuple[str, str]:
    owner, repository, _ = parse_github_url_with_branch(repository_url)
    return owner, repository


def parse_github_url_with_branch(repository_url: str) -> tuple[str, str, str | None]:
    """Parse https://github.com/owner/repo[.git] or .../owner/repo/tree/<branch>."""
    try:
        parsed = urlparse(repository_url.strip())
        port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid GitHub repository URL.") from exc
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"github.com", "www.github.com"}
        or port not in (None, 443)
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise HTTPException(
            status_code=422,
            detail="Use an HTTPS GitHub URL in the form https://github.com/owner/repository.",
        )
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    branch: str | None = None
    if len(parts) >= 4 and parts[2] == "tree":
        branch = unquote("/".join(parts[3:]))
        parts = parts[:2]
    if len(parts) != 2:
        raise HTTPException(
            status_code=422,
            detail="Use a repository URL (optionally …/tree/<branch>), not a file, issue, or pull-request URL.",
        )
    owner, repository = parts
    if repository.lower().endswith(".git"):
        repository = repository[:-4]
    if (
        not REPO_SEGMENT.fullmatch(owner)
        or not REPO_SEGMENT.fullmatch(repository)
        or owner in {".", ".."}
        or repository in {".", ".."}
    ):
        raise HTTPException(status_code=422, detail="Invalid GitHub owner or repository name.")
    if branch is not None:
        branch = validate_branch(branch)
    return owner, repository, branch


def validate_branch(branch: str) -> str:
    branch = branch.strip()
    if (
        not BRANCH_PATTERN.fullmatch(branch)
        or ".." in branch
        or branch.startswith(("/", "-"))
        or branch.endswith(("/", ".lock", "."))
        or "//" in branch
    ):
        raise HTTPException(status_code=422, detail="Invalid branch name.")
    return branch


def _headers(token: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "CodeSentry-AI",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _raise_for_github(response: httpx.Response, *, user_token: bool, context: str) -> None:
    status = response.status_code
    if status == 200:
        return
    remaining = response.headers.get("X-RateLimit-Remaining")
    if status == 429 or (status == 403 and remaining == "0"):
        reset = response.headers.get("X-RateLimit-Reset")
        wait = ""
        if reset and reset.isdigit():
            wait = f" Try again in about {max(1, round((int(reset) - time.time()) / 60))} minute(s)."
        raise HTTPException(
            status_code=429,
            detail="GitHub API rate limit reached." + wait + " Configuring GITHUB_TOKEN on the server raises the limit.",
        )
    if status == 401:
        raise HTTPException(
            status_code=401 if user_token else 502,
            detail=(
                "GitHub rejected the access token you supplied (invalid or expired)."
                if user_token
                else "The server's GITHUB_TOKEN was rejected by GitHub (invalid or expired). Ask the administrator to replace it."
            ),
        )
    if status == 409:
        raise HTTPException(status_code=422, detail="This repository is empty; there is no code to analyze.")
    if status in {403, 404}:
        if context == "branch":
            raise HTTPException(status_code=404, detail="That branch was not found in the repository.")
        raise HTTPException(
            status_code=404,
            detail=(
                "Repository not found, or your token does not grant access to it."
                if user_token
                else "Repository not found. It may be private, renamed, or deleted. Private repositories need your own GitHub token."
            ),
        )
    if status == 451:
        raise HTTPException(status_code=403, detail="GitHub has blocked access to this repository.")
    raise HTTPException(status_code=502, detail=f"GitHub returned an unexpected response ({status}).")


def _github_get(
    client: httpx.Client,
    endpoint: str,
    token: str | None,
    *,
    user_token: bool,
    context: str = "repository",
) -> Any:
    try:
        response = client.get(f"https://api.github.com{endpoint}", headers=_headers(token))
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="GitHub request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not connect to GitHub.") from exc
    _raise_for_github(response, user_token=user_token, context=context)
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="GitHub returned an invalid response.") from exc


def _resolve_tokens(settings: Settings, user_token: str | None) -> tuple[str | None, bool]:
    if user_token:
        return user_token, True
    return settings.github_token, False


def list_branches(
    repository_url: str, settings: Settings, user_token: str | None = None
) -> dict[str, Any]:
    owner, repository, _ = parse_github_url_with_branch(repository_url)
    token, is_user_token = _resolve_tokens(settings, user_token)
    with httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0), follow_redirects=False) as client:
        metadata = _github_get(client, f"/repos/{owner}/{repository}", token, user_token=is_user_token)
        if metadata.get("private") and not is_user_token:
            raise HTTPException(
                status_code=403,
                detail="This repository is private. Provide your own GitHub token with read access to scan it.",
            )
        branches: list[str] = []
        for page in range(1, 4):
            data = _github_get(
                client,
                f"/repos/{owner}/{repository}/branches?per_page=100&page={page}",
                token,
                user_token=is_user_token,
            )
            if not isinstance(data, list):
                break
            branches.extend(item["name"] for item in data if isinstance(item, dict) and isinstance(item.get("name"), str))
            if len(data) < 100:
                break
    default_branch = metadata.get("default_branch")
    if default_branch in branches:
        branches.remove(default_branch)
        branches.insert(0, default_branch)
    return {
        "repo_url": f"https://github.com/{owner}/{repository}",
        "default_branch": default_branch,
        "branches": branches,
        "private": bool(metadata.get("private")),
        "truncated": len(branches) >= 300,
    }


def _download(
    client: httpx.Client,
    owner: str,
    repository: str,
    commit_sha: str,
    entry: dict[str, Any],
    token: str | None,
    use_api: bool,
    max_bytes: int,
    deadline: float,
) -> tuple[str, bytes | None, str | None]:
    """Download one blob. Returns (path, content or None, skip reason or None)."""
    path = entry["path"]
    if time.monotonic() > deadline:
        return path, None, "limit_exceeded"
    if use_api:
        url = f"https://api.github.com/repos/{owner}/{repository}/git/blobs/{entry['sha']}"
        headers = {**_headers(token), "Accept": "application/vnd.github.raw"}
    else:
        url = (
            f"https://raw.githubusercontent.com/{quote(owner, safe='')}/{quote(repository, safe='')}/"
            f"{quote(commit_sha, safe='')}/{quote(path, safe='/')}"
        )
        headers = {"User-Agent": "CodeSentry-AI"}
    try:
        with client.stream("GET", url, headers=headers) as response:
            if response.status_code in {403, 429} and use_api:
                _raise_for_github(response, user_token=bool(token), context="blob")
            if response.status_code != 200:
                return path, None, "download_failed"
            chunks: list[bytes] = []
            total = 0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    return path, None, "oversized"
                if time.monotonic() > deadline:
                    return path, None, "limit_exceeded"
                chunks.append(chunk)
            return path, b"".join(chunks), None
    except httpx.HTTPError:
        return path, None, "download_failed"


def fetch_repository(
    repository_url: str,
    branch: str | None,
    settings: Settings,
    user_token: str | None = None,
) -> RepositorySnapshot:
    owner, repository, url_branch = parse_github_url_with_branch(repository_url)
    requested_branch = validate_branch(branch) if branch else url_branch
    token, is_user_token = _resolve_tokens(settings, user_token)
    repo_url = f"https://github.com/{owner}/{repository}"
    started_at = time.monotonic()
    deadline = started_at + settings.repository_timeout_seconds
    warnings: list[str] = []
    skipped = {
        "vendor_or_generated": 0,
        "binary_or_media": 0,
        "unsupported_type": 0,
        "oversized": 0,
        "not_utf8": 0,
        "limit_exceeded": 0,
        "documentation_or_other": 0,
    }
    examples: list[dict[str, str]] = []

    def skip(path: str, reason_key: str, reason: str) -> None:
        skipped[reason_key] = skipped.get(reason_key, 0) + 1
        if len(examples) < MAX_SKIPPED_EXAMPLES:
            examples.append({"path": path, "reason": reason})

    timeout = httpx.Timeout(20.0, connect=5.0)
    limits = httpx.Limits(max_connections=DOWNLOAD_WORKERS + 2, max_keepalive_connections=DOWNLOAD_WORKERS)
    with httpx.Client(timeout=timeout, limits=limits, follow_redirects=False) as client:
        metadata = _github_get(client, f"/repos/{owner}/{repository}", token, user_token=is_user_token)
        is_private = bool(metadata.get("private"))
        if is_private and not is_user_token:
            # Never let the server's own credential expose a private repository.
            raise HTTPException(
                status_code=403,
                detail="This repository is private. Provide your own GitHub token with read access to scan it.",
            )
        if metadata.get("size") == 0 and not requested_branch:
            raise HTTPException(status_code=422, detail="This repository is empty; there is no code to analyze.")
        resolved_branch = requested_branch or metadata.get("default_branch")
        if not isinstance(resolved_branch, str) or not resolved_branch:
            raise HTTPException(status_code=422, detail="This repository has no default branch (it may be empty).")
        branch_info = _github_get(
            client,
            f"/repos/{owner}/{repository}/branches/{quote(resolved_branch, safe='')}",
            token,
            user_token=is_user_token,
            context="branch",
        )
        commit_sha = ((branch_info or {}).get("commit") or {}).get("sha")
        if not isinstance(commit_sha, str) or not re.fullmatch(r"[0-9a-f]{40}", commit_sha):
            raise HTTPException(status_code=502, detail="GitHub returned an invalid branch commit.")
        tree = _github_get(
            client,
            f"/repos/{owner}/{repository}/git/trees/{commit_sha}?recursive=1",
            token,
            user_token=is_user_token,
        )
        entries = tree.get("tree") if isinstance(tree, dict) else None
        if not isinstance(entries, list):
            raise HTTPException(status_code=502, detail="GitHub returned an invalid file tree.")
        if tree.get("truncated"):
            warnings.append(
                "GitHub truncated the file tree because the repository is very large; only part of the repository was examined."
            )
            skipped["limit_exceeded"] += 1

        blobs = [
            entry
            for entry in entries
            if isinstance(entry, dict)
            and entry.get("type") == "blob"
            and isinstance(entry.get("path"), str)
            and isinstance(entry.get("sha"), str)
        ]
        if not blobs:
            raise HTTPException(status_code=422, detail="This branch contains no files to analyze.")
        languages = sorted(
            {
                language
                for entry in blobs
                if not any(part.lower() in SKIP_DIRECTORIES for part in entry["path"].split("/"))
                for extension, language in LANGUAGE_EXTENSIONS.items()
                if entry["path"].lower().endswith(extension)
            }
        )

        candidates: list[tuple[int, dict[str, Any]]] = []
        for entry in blobs:
            path = entry["path"]
            lower = path.lower()
            name = lower.rsplit("/", 1)[-1]
            size = entry.get("size", 0)
            if (
                path.startswith("/")
                or len(path) > 500
                or "\\" in path
                or "\x00" in path
                or any(part in {"", ".", ".."} for part in path.split("/"))
            ):
                skip(path, "documentation_or_other", "unsafe path")
                continue
            if any(part.lower() in SKIP_DIRECTORIES for part in path.split("/")[:-1]):
                skip(path, "vendor_or_generated", "dependency, build, or vendored directory")
                continue
            extension = "." + name.rsplit(".", 1)[-1] if "." in name else ""
            if extension in BINARY_EXTENSIONS and name not in LOCKFILE_EXCEPTIONS:
                skip(path, "binary_or_media", "binary, media, or generated file")
                continue
            if lower.endswith((".min.js", ".min.css", ".bundle.js", ".pb.go", "_pb2.py")):
                skip(path, "vendor_or_generated", "minified or generated file")
                continue
            kind = classify(path)
            if kind is None:
                from backend.rules import UNSUPPORTED_SOURCE

                if extension in UNSUPPORTED_SOURCE:
                    skip(path, "unsupported_type", f"unsupported language ({UNSUPPORTED_SOURCE[extension]})")
                else:
                    skip(path, "documentation_or_other", "not a supported source or configuration file")
                continue
            if not isinstance(size, int) or size < 0:
                skip(path, "documentation_or_other", "missing size information")
                continue
            limit = settings.max_manifest_bytes if kind[0] == "manifest" else settings.max_source_file_bytes
            if size > limit:
                skip(path, "oversized", f"larger than {limit // 1000} KB limit")
                continue
            priority = {"manifest": 0, "config": 1, "code": 2}[kind[0]]
            candidates.append((priority, entry))

        candidates.sort(key=lambda item: (item[0], item[1]["path"].count("/"), item[1]["path"]))
        selected: list[dict[str, Any]] = []
        total_bytes = 0
        for _, entry in candidates:
            if len(selected) >= settings.max_repository_files:
                skip(entry["path"], "limit_exceeded", f"over the {settings.max_repository_files}-file scan limit")
                continue
            if total_bytes + entry["size"] > settings.max_repository_bytes:
                skip(entry["path"], "limit_exceeded", "over the total repository size limit")
                continue
            total_bytes += entry["size"]
            selected.append(entry)
        if skipped["limit_exceeded"]:
            warnings.append(
                f"{skipped['limit_exceeded']} file(s) were not scanned because the repository exceeds the configured scan limits."
            )

        use_api = is_user_token  # private repositories need authenticated blob access
        files: list[dict[str, str]] = []
        with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as pool:
            downloads = list(
                pool.map(
                    lambda entry: _download(
                        client,
                        owner,
                        repository,
                        commit_sha,
                        entry,
                        token,
                        use_api,
                        settings.max_manifest_bytes if entry["path"].lower().endswith((".json", ".lock")) else settings.max_source_file_bytes,
                        deadline,
                    ),
                    selected,
                )
            )
        failed_downloads = 0
        for path, content, reason in downloads:
            if reason == "limit_exceeded":
                skip(path, "limit_exceeded", "repository retrieval time limit reached")
                continue
            if reason == "oversized":
                skip(path, "oversized", "file exceeded the size limit while downloading")
                continue
            if reason or content is None:
                failed_downloads += 1
                skip(path, "limit_exceeded", "download failed")
                continue
            if b"\x00" in content[:8000]:
                skip(path, "binary_or_media", "binary content")
                continue
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                skip(path, "not_utf8", "not valid UTF-8 text")
                continue
            files.append({"path": path, "content": text.removeprefix("﻿")})
        if failed_downloads:
            warnings.append(f"{failed_downloads} file(s) could not be downloaded from GitHub and were not scanned.")
        if time.monotonic() > deadline:
            warnings.append(
                f"Repository retrieval hit the {settings.repository_timeout_seconds}-second limit; remaining files were not scanned."
            )

    logger.info(
        "Fetched repository files repo=%s/%s branch=%s selected=%s downloaded=%s private=%s",
        owner,
        repository,
        resolved_branch,
        len(selected),
        len(files),
        is_private,
    )
    return RepositorySnapshot(
        repo_url=repo_url,
        owner=owner,
        name=repository,
        branch=resolved_branch,
        commit_sha=commit_sha,
        private=is_private,
        files=files,
        repository_file_count=len(blobs),
        languages=languages,
        skipped=skipped,
        skipped_examples=examples,
        warnings=warnings,
    )
