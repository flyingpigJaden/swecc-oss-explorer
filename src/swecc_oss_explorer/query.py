"""Query building for GitHub issue search.

Constraint that shapes everything: GitHub's search API rejects queries longer
than 256 characters, so we can't OR together 100 ``repo:`` qualifiers in one
call. Instead:

* ``swecc`` scope   -> ``org:swecc-uw`` qualifier (one cheap query, full coverage)
* ``top`` scope     -> one global issue search, then client-side filtering
                       against the top-100 repo set
* ``all`` scope     -> one global issue search, no filtering
"""

from __future__ import annotations

from .discovery import SCOPES, SWECC_ORG

DEFAULT_LABELS = ["good first issue", "help wanted"]

SORT_CHOICES = ("created", "updated", "comments", "reactions")


def build_issue_query(
    *,
    scope: str = "all",
    labels: list[str] | None = None,
    language: str | None = None,
    repos: list[str] | None = None,
    text: str | None = None,
    state: str = "open",
) -> str:
    """Compose a GitHub issue search query string (<= 256 chars)."""
    if scope not in SCOPES:
        raise ValueError(f"scope must be one of {SCOPES}, got {scope!r}")

    parts = ["is:issue", f"is:{state}"]

    if scope == "swecc":
        parts.append(f"org:{SWECC_ORG}")
    for repo in repos or []:
        parts.append(f"repo:{repo}")

    for label in labels or []:
        parts.append(f'label:"{label}"')
    if language:
        parts.append(f"language:{language}")
    if text:
        parts.append(text)

    query = " ".join(parts)
    if len(query) > 256:
        raise ValueError(
            f"query exceeds GitHub's 256-char search limit ({len(query)} chars); "
            "reduce the number of repos/labels in one query"
        )
    return query


def filter_by_repos(items: list[dict], allowed_full_names: set[str]) -> list[dict]:
    """Keep only issues whose repository is in the allowed set (for the ``top`` scope)."""
    if not allowed_full_names:
        return items

    def repo_name(item: dict) -> str:
        # repository_url looks like https://api.github.com/repos/{owner}/{repo}
        url = item.get("repository_url", "")
        return url.removeprefix("https://api.github.com/repos/")

    return [i for i in items if repo_name(i) in allowed_full_names]
