"""A faithful in-process stand-in for the parts of the GitHub API CodeSentry uses.

It serves repository metadata, branch lists, branch commits, recursive trees,
raw file downloads (raw.githubusercontent.com) and authenticated blob
downloads, including GitHub's error behaviour for private repositories, empty
repositories, unknown branches and rate limiting. Tests mount it with
``httpx.MockTransport`` so no network access is needed.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote

import httpx


@dataclass
class FakeRepo:
    owner: str
    name: str
    branches: dict[str, dict[str, bytes]]
    default_branch: str = "main"
    private: bool = False
    allowed_tokens: set[str] = field(default_factory=set)

    def commit_sha(self, branch: str) -> str:
        return hashlib.sha1(f"{self.owner}/{self.name}@{branch}".encode()).hexdigest()


def _blob_sha(content: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(content) + content).hexdigest()


class FakeGitHub:
    def __init__(self, *repos: FakeRepo, rate_limited: bool = False) -> None:
        self.repos = {(repo.owner.lower(), repo.name.lower()): repo for repo in repos}
        self.rate_limited = rate_limited
        self.requests: list[httpx.Request] = []

    # -- helpers -------------------------------------------------------
    def _repo(self, owner: str, name: str) -> FakeRepo | None:
        return self.repos.get((owner.lower(), name.lower()))

    def _authorized(self, repo: FakeRepo, request: httpx.Request) -> bool:
        if not repo.private:
            return True
        header = request.headers.get("Authorization", "")
        return header.removeprefix("Bearer ") in repo.allowed_tokens

    def _branch_by_sha(self, repo: FakeRepo, sha: str) -> str | None:
        for branch in repo.branches:
            if repo.commit_sha(branch) == sha:
                return branch
        return None

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    # -- routing -------------------------------------------------------
    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.rate_limited and request.url.host == "api.github.com":
            return httpx.Response(403, json={"message": "API rate limit exceeded"}, headers={"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "9999999999"})
        if request.headers.get("Authorization") == "Bearer invalid-token-for-tests":
            return httpx.Response(401, json={"message": "Bad credentials"})
        if request.url.host == "raw.githubusercontent.com":
            return self._raw(request)
        if request.url.host != "api.github.com":
            return httpx.Response(404)
        path = request.url.path
        match = re.fullmatch(r"/repos/([^/]+)/([^/]+)(/.*)?", path)
        if not match:
            return httpx.Response(404, json={"message": "Not Found"})
        repo = self._repo(match.group(1), match.group(2))
        if repo is None or not self._authorized(repo, request):
            return httpx.Response(404, json={"message": "Not Found"})
        rest = match.group(3) or ""
        if rest == "":
            size = sum(len(content) for files in repo.branches.values() for content in files.values())
            return httpx.Response(200, json={
                "full_name": f"{repo.owner}/{repo.name}",
                "default_branch": repo.default_branch if repo.branches else None,
                "private": repo.private,
                "size": (size + 1023) // 1024,
            })
        if not repo.branches:
            return httpx.Response(409, json={"message": "Git Repository is empty."})
        if rest == "/branches":
            return httpx.Response(200, json=[{"name": name, "commit": {"sha": repo.commit_sha(name)}} for name in repo.branches])
        branch_match = re.fullmatch(r"/branches/(.+)", rest)
        if branch_match:
            branch = unquote(branch_match.group(1))
            if branch not in repo.branches:
                return httpx.Response(404, json={"message": "Branch not found"})
            return httpx.Response(200, json={"name": branch, "commit": {"sha": repo.commit_sha(branch)}})
        tree_match = re.fullmatch(r"/git/trees/([0-9a-f]{40})", rest)
        if tree_match:
            branch = self._branch_by_sha(repo, tree_match.group(1))
            if branch is None:
                return httpx.Response(404, json={"message": "Not Found"})
            return httpx.Response(200, json={
                "sha": tree_match.group(1),
                "truncated": False,
                "tree": [
                    {"path": file_path, "type": "blob", "mode": "100644", "sha": _blob_sha(content), "size": len(content)}
                    for file_path, content in sorted(repo.branches[branch].items())
                ],
            })
        blob_match = re.fullmatch(r"/git/blobs/([0-9a-f]{40})", rest)
        if blob_match:
            for files in repo.branches.values():
                for content in files.values():
                    if _blob_sha(content) == blob_match.group(1):
                        return httpx.Response(200, content=content)
            return httpx.Response(404)
        return httpx.Response(404, json={"message": "Not Found"})

    def _raw(self, request: httpx.Request) -> httpx.Response:
        parts = request.url.path.lstrip("/").split("/", 3)
        if len(parts) < 4:
            return httpx.Response(400)
        owner, name, ref, file_path = parts
        repo = self._repo(owner, name)
        if repo is None or repo.private:
            return httpx.Response(404)  # raw.githubusercontent.com does not serve private files anonymously
        branch = self._branch_by_sha(repo, ref) or (ref if ref in repo.branches else None)
        if branch is None:
            return httpx.Response(404)
        content = repo.branches[branch].get(unquote(file_path))
        if content is None:
            return httpx.Response(404)
        return httpx.Response(200, content=content)


def repo_from_git_clone(path: str | Path, owner: str, name: str) -> FakeRepo:
    """Build a FakeRepo from a real local clone (all remote branches)."""
    path = Path(path)

    def git(*args: str) -> bytes:
        return subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True).stdout

    head = git("rev-parse", "--abbrev-ref", "origin/HEAD").decode().strip().removeprefix("origin/")
    branch_names = [
        line.strip().removeprefix("origin/")
        for line in git("branch", "-r", "--format=%(refname:short)").decode().splitlines()
        if line.strip() and "HEAD" not in line and line.strip() != "origin"
    ]
    branches: dict[str, dict[str, bytes]] = {}
    for branch in branch_names:
        files: dict[str, bytes] = {}
        listing = git("ls-tree", "-r", "-z", f"origin/{branch}").split(b"\0")
        for row in listing:
            if not row:
                continue
            meta, file_path = row.split(b"\t", 1)
            mode, kind, sha = meta.split()
            if kind != b"blob":
                continue
            files[file_path.decode("utf-8", "replace")] = git("cat-file", "blob", sha.decode())
        branches[branch] = files
    return FakeRepo(owner=owner, name=name, branches=branches, default_branch=head)
