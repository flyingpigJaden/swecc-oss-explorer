"""Repo discovery: which repos should the explorer scan?

Everything is resolved live on every run (nothing is cached to disk):

* ``top`` — the top N most active open-source repos, approximated with a
  single search query: many stars + pushed recently, sorted by stars. This is
  a deliberately simple heuristic; improving it is tracked in the repo's
  issue tracker.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .github import GitHubClient

# Heuristic knobs for "most active". Tuned to keep it to ONE search call.
TOP_REPO_MIN_STARS = 5_000
TOP_REPO_PUSHED_WITHIN_DAYS = 30

SCOPES = ("top", "all")


def top_active_repos(client: GitHubClient, limit: int = 100) -> list[dict]:
    """Top `limit` repos by stars among repos pushed within the last 30 days.

    Single-query heuristic on purpose: it costs one API call and needs no
    background jobs or persistence. See docs on upgrading to commit-activity
    based scoring.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=TOP_REPO_PUSHED_WITHIN_DAYS)).strftime(
        "%Y-%m-%d"
    )
    query = f"stars:>{TOP_REPO_MIN_STARS} pushed:>={since} archived:false"
    repos = client.search_repos(query, sort="stars", per_page=min(limit, 100))
    return repos[:limit]


def discover(client: GitHubClient, scope: str, limit: int = 100) -> list[dict]:
    """Return the repo set for a scope. ``all`` returns [] (no repo filter)."""
    if scope == "top":
        return top_active_repos(client, limit=limit)
    return []


def repo_full_names(repos: list[dict]) -> set[str]:
    """``{'owner/name', ...}`` used for client-side filtering of search results."""
    return {r.get("full_name", "") for r in repos if r.get("full_name")}
