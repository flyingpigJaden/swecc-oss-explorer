"""Tiny human-friendly age parsing, shared by the CLI's ``--max-age`` flag.

Examples: ``30d``, ``2w``, ``3mo``, ``1y``; ``any``/``0`` disables the filter.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_UNIT_DAYS = {
    "d": 1,
    "w": 7,
    "mo": 30,
    "m": 30,
    "y": 365,
}

_PATTERN = re.compile(r"^(\d+)\s*(d|w|mo|m|y)$", re.IGNORECASE)
_NONE_VALUES = {"any", "all", "none", "0", ""}


def parse_age(text: str) -> int | None:
    """Parse a human age spec into days, or ``None`` for "no limit"."""
    t = text.strip().lower()
    if t in _NONE_VALUES:
        return None
    match = _PATTERN.match(t)
    if not match:
        raise ValueError(
            f"invalid age {text!r}: use a number plus d/w/mo/y (e.g. 30d, 2w, 3mo, 1y) or 'any'"
        )
    return int(match.group(1)) * _UNIT_DAYS[match.group(2)]


def days_ago_iso(days: int) -> str:
    """ISO date (YYYY-MM-DD) for N days before today, UTC."""
    today = datetime.now(timezone.utc).date()
    return (today - timedelta(days=days)).isoformat()
