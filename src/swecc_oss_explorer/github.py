"""Thin GitHub REST API client.

Everything in the explorer is live: we never persist issues or repos.
All data comes straight from the public GitHub REST API on each run.
"""

from __future__ import annotations

import os
from typing import Any

import requests

API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"

# The search API caps queries at 256 characters and unauthenticated
# clients at 10 requests/minute. Keep queries small and batch carefully.
MAX_QUERY_LENGTH = 256


class GitHubError(RuntimeError):
    """Raised when the GitHub API returns an error we can't recover from."""


class RateLimitError(GitHubError):
    """Raised when we hit GitHub's search rate limit."""


class GitHubClient:
    """A minimal, stateless client for the GitHub REST API."""

    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": API_VERSION,
                "User-Agent": "swecc-oss-explorer",
            }
        )
        if self.token:
            self.session.headers["Authorization"] = f"Bearer {self.token}"

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self.session.get(f"{API_BASE}{path}", params=params, timeout=30)
        if resp.status_code in (403, 429) and "rate limit" in resp.text.lower():
            raise RateLimitError(
                "GitHub search rate limit reached. "
                "Set GITHUB_TOKEN to raise it (10/min unauthenticated, 30/min authenticated)."
            )
        if resp.status_code == 422:
            # Common cause: query longer than MAX_QUERY_LENGTH or bad qualifier.
            raise GitHubError(f"GitHub rejected the query: {resp.json().get('message', resp.text)}")
        if resp.status_code != 200:
            raise GitHubError(f"GitHub API error {resp.status_code}: {resp.text[:300]}")
        return resp.json()

    def search_issues(
        self,
        query: str,
        *,
        sort: str | None = None,
        per_page: int = 50,
        max_pages: int = 1,
    ) -> list[dict[str, Any]]:
        """Search issues with the given query string. Returns up to max_pages * per_page items."""
        items: list[dict[str, Any]] = []
        for page in range(1, max_pages + 1):
            params: dict[str, Any] = {"q": query, "per_page": per_page, "page": page}
            if sort:
                params["sort"] = sort
            data = self._get("/search/issues", params)
            batch = data.get("items", [])
            items.extend(batch)
            if len(batch) < per_page or len(items) >= data.get("total_count", 0):
                break
        return items

    def search_repos(
        self,
        query: str,
        *,
        sort: str | None = None,
        per_page: int = 100,
        max_pages: int = 1,
    ) -> list[dict[str, Any]]:
        """Search repositories with the given query string."""
        repos: list[dict[str, Any]] = []
        for page in range(1, max_pages + 1):
            params: dict[str, Any] = {"q": query, "per_page": per_page, "page": page}
            if sort:
                params["sort"] = sort
            data = self._get("/search/repositories", params)
            batch = data.get("items", [])
            repos.extend(batch)
            if len(batch) < per_page or len(repos) >= data.get("total_count", 0):
                break
        return repos

    def org_repos(self, org: str, *, per_page: int = 100) -> list[dict[str, Any]]:
        """List all public repos for an organization (live, paginated)."""
        repos: list[dict[str, Any]] = []
        page = 1
        while True:
            data = self._get(f"/orgs/{org}/repos", {"per_page": per_page, "page": page})
            batch = data if isinstance(data, list) else []
            repos.extend(batch)
            if len(batch) < per_page:
                break
            page += 1
        return repos

    def rate_limit_remaining(self) -> int:
        """Remaining search-API requests this minute (for status displays)."""
        data = self._get("/rate_limit")
        return int(data.get("resources", {}).get("search", {}).get("remaining", -1))
