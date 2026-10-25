# Contributing to OSS Explorer

Thanks for contributing! This repo is a **SWECC Labs** project and a deliberate
on-ramp for SWECC members making their first contributions to open source —
possibly their first ever. Don't hesitate to ask questions in your issue or PR.

## Finding work

1. Browse issues labeled [`good first issue`](https://github.com/swecc-uw/swecc-oss-explorer/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or [`help wanted`](https://github.com/swecc-uw/swecc-oss-explorer/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
2. Comment "I'd like to work on this" so others don't duplicate effort.
3. One issue = one PR. Keep PRs small.

## Setup

```bash
git clone https://github.com/swecc-uw/swecc-oss-explorer
cd swecc-oss-explorer
python -m venv .venv && source .venv/bin/activate
pip install -e . pytest ruff
```

## Conventions

- **Python**: `src/` layout, formatted/linted with `ruff check src tests`,
  tested with `pytest`. Target Python 3.10+.
- **Website**: no build step, no framework, no npm. Vanilla HTML/CSS/JS in
  `web/`. Keep it that way unless an issue says otherwise — it's what makes the
  project approachable.
- **Design rule**: everything is fetched live from the GitHub API. Never add
  persistence (databases, server-side caches, scheduled crawlers) without
  discussing it in an issue first.
- When touching query logic in `src/swecc_oss_explorer/query.py` or the
  heuristic in `discovery.py`, mirror the change in `web/app.js` (and vice
  versa) — the two must stay in sync. Add a test for it.

## Pull requests

1. Fork / branch off `main` with a short name like `fix-label-filter`.
2. Run `ruff check src tests && pytest -q` before pushing.
3. Describe what changed and why; link the issue (`Closes #12`).
4. A maintainer will review — CI must pass.

## Reporting bugs

Open an issue with: what you searched, what you expected, what happened, and a
screenshot if it's a website bug. Check the browser console (or terminal output)
for errors and include them.
