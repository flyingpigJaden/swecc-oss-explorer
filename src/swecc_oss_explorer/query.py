"""Query building for GitHub issue search.

Constraint that shapes everything: GitHub's search API rejects queries longer
than 256 characters, so a scope covering ~100 repos can't OR together all its
``repo:`` qualifiers in one call. Instead (see ``explore.py``):

* ``top`` scope — repo batches are packed greedily under the char budget and
  searched one query per batch
* ``all`` scope — one global issue search, no filtering
"""

from __future__ import annotations

SCOPES = ("top", "all")

DEFAULT_LABELS = ["good first issue", "help wanted"]

SORT_CHOICES = ("created", "updated", "comments", "reactions")


def build_issue_query(
    *,
    scope: str = "all",
    labels: list[str] | None = None,
    language: str | None = None,
    repos: list[str] | None = None,
    text: str | None = None,
    created_since: str | None = None,
    state: str = "open",
) -> str:
    """Compose a GitHub issue search query string (<= 256 chars)."""
    if scope not in SCOPES:
        raise ValueError(f"scope must be one of {SCOPES}, got {scope!r}")

    parts = ["is:issue", f"is:{state}"]

    for repo in repos or []:
        parts.append(f"repo:{repo}")

    if created_since:
        parts.append(f"created:>={created_since}")

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
