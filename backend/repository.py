from __future__ import annotations

import logging
import re
import time
from urllib.parse import quote, urlparse
from typing import Any

import httpx
from fastapi import HTTPException

from backend.config import Settings

logger = logging.getLogger(__name__)
REPO_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
SKIP_DIRECTORIES = {
    ".git",
    ".github",
    ".idea",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "site-packages",
    "venv",
}
LANGUAGE_EXTENSIONS = {
    ".py": "Python",
    ".pyi": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".hpp": "C++",
    ".php": "PHP",
    ".rb": "Ruby",
    ".sh": "Shell",
    ".sql": "SQL",
}


def parse_github_url(repository_url: str) -> tuple[str, str]:
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
            detail="Use a public HTTPS GitHub URL in the form https://github.com/owner/repository.",
        )
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) != 2:
        raise HTTPException(
            status_code=422,
            detail="Use a repository URL, not a branch, tree, or file URL.",
        )
    owner, repository = parts
    if repository.lower().endswith(".git"):
        repository = repository[:-4]
    if not REPO_SEGMENT.fullmatch(owner) or not REPO_SEGMENT.fullmatch(repository):
        raise HTTPException(status_code=422, detail="Invalid GitHub owner or repository name.")
    if owner in {".", ".."} or repository in {".", ".."}:
        raise HTTPException(status_code=422, detail="Invalid GitHub owner or repository name.")
    return owner, repository


def _github_get(
    client: httpx.Client, endpoint: str, settings: Settings
) -> dict[str, Any]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    try:
        response = client.get(f"https://api.github.com{endpoint}", headers=headers)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="GitHub request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not connect to GitHub.") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="GitHub repository or branch was not found.")
    if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
        raise HTTPException(status_code=429, detail="GitHub API rate limit reached; try again later.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="GitHub could not provide repository data.")
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="GitHub returned an invalid response.") from exc


def _github_raw_get(
    client: httpx.Client,
    owner: str,
    repository: str,
    branch: str,
    path: str,
    max_bytes: int,
    deadline: float,
) -> bytes:
    url = (
        f"https://raw.githubusercontent.com/{quote(owner, safe='')}/"
        f"{quote(repository, safe='')}/{quote(branch, safe='/')}/"
        f"{quote(path, safe='/')}"
    )
    try:
        with client.stream("GET", url, headers={"Accept": "application/vnd.github.raw"}) as response:
            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="A repository source file could not be found.")
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="GitHub could not provide a source file.")
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > max_bytes:
                raise HTTPException(status_code=413, detail="A repository source file exceeds the configured size limit.")
            chunks: list[bytes] = []
            total_bytes = 0
            for chunk in response.iter_bytes():
                if time.monotonic() > deadline:
                    raise HTTPException(
                        status_code=504,
                        detail="Repository retrieval exceeded the 120-second processing limit.",
                    )
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise HTTPException(status_code=413, detail="A repository source file exceeds the configured size limit.")
                chunks.append(chunk)
            return b"".join(chunks)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="GitHub source download timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not download GitHub source.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="GitHub returned an invalid source size.") from exc


def fetch_repository_files(
    repository_url: str, branch: str | None, settings: Settings
) -> tuple[str, str, list[dict[str, str]], list[str], dict[str, int]]:
    owner, repository = parse_github_url(repository_url)
    repo_url = f"https://github.com/{owner}/{repository}"
    timeout = httpx.Timeout(15.0, connect=5.0)
    limits = httpx.Limits(max_connections=4, max_keepalive_connections=2)
    started_at = time.monotonic()
    try:
        with httpx.Client(timeout=timeout, limits=limits, follow_redirects=False) as client:
            metadata = _github_get(client, f"/repos/{owner}/{repository}", settings)
            resolved_branch = branch or metadata.get("default_branch")
            if not isinstance(resolved_branch, str) or not resolved_branch or len(resolved_branch) > 200:
                raise HTTPException(status_code=502, detail="GitHub returned an invalid default branch.")
            encoded_branch = quote(resolved_branch, safe="")
            tree = _github_get(
                client,
                f"/repos/{owner}/{repository}/git/trees/{encoded_branch}?recursive=1",
                settings,
            )
            if tree.get("truncated"):
                raise HTTPException(
                    status_code=413,
                    detail="Repository tree exceeds GitHub's safe response limit.",
                )
            entries = tree.get("tree")
            if not isinstance(entries, list):
                raise HTTPException(status_code=502, detail="GitHub returned an invalid file tree.")
            selected = []
            seen_paths: set[str] = set()
            oversized_python_files = 0
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                path = entry.get("path")
                if (
                    entry.get("type") != "blob"
                    or not isinstance(path, str)
                    or path.startswith("/")
                    or len(path) > 500
                    or "\\" in path
                    or any(part in {"", ".", ".."} for part in path.split("/"))
                    or any(part.lower() in SKIP_DIRECTORIES for part in path.split("/"))
                    or not path.lower().endswith((".py", ".pyi"))
                    or path in seen_paths
                ):
                    continue
                size = entry.get("size", 0)
                if not isinstance(size, int) or size < 0:
                    continue
                if size > settings.max_source_file_bytes:
                    oversized_python_files += 1
                    continue
                seen_paths.add(path)
                selected.append((path, size))
                if len(selected) > settings.max_repository_files:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Repository exceeds the {settings.max_repository_files} Python-file limit.",
                    )

            total_size = sum(item[1] for item in selected)
            if total_size > settings.max_repository_bytes:
                raise HTTPException(
                    status_code=413,
                    detail="Python source files exceed the configured repository size limit.",
                )

            files: list[dict[str, str]] = []
            consumed_bytes = 0
            invalid_utf8_files = 0
            deadline = started_at + 120
            for path, size in selected:
                if time.monotonic() > deadline:
                    raise HTTPException(
                        status_code=504,
                        detail="Repository retrieval exceeded the 120-second processing limit.",
                    )
                try:
                    content_bytes = _github_raw_get(
                        client,
                        owner,
                        repository,
                        resolved_branch,
                        path,
                        settings.max_source_file_bytes,
                        deadline,
                    )
                    if len(content_bytes) != size:
                        raise ValueError("Blob size does not match the repository tree.")
                    content = content_bytes.decode("utf-8")
                except (ValueError, UnicodeDecodeError):
                    logger.warning("Skipped invalid or non-UTF-8 Python source file %s", path)
                    invalid_utf8_files += 1
                    continue
                consumed_bytes += len(content_bytes)
                if consumed_bytes > settings.max_repository_bytes:
                    raise HTTPException(status_code=413, detail="Repository source size limit exceeded.")
                files.append({"path": path, "content": content, "language": "Python"})
            languages = sorted(
                {
                    language
                    for entry in entries
                    if isinstance(entry, dict)
                    and entry.get("type") == "blob"
                    and isinstance(entry.get("path"), str)
                    and not any(
                        part.lower() in SKIP_DIRECTORIES
                        for part in entry["path"].split("/")
                    )
                    for extension, language in LANGUAGE_EXTENSIONS.items()
                    if entry["path"].lower().endswith(extension)
                }
            )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not retrieve repository files.") from exc
    return repo_url, resolved_branch, files, languages, {
        "repository_files": sum(entry.get("type") == "blob" for entry in entries),
        "python_files": len(files),
        "oversized_python_files": oversized_python_files,
        "invalid_utf8_python_files": invalid_utf8_files,
    }
