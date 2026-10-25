# 🧭 SWECC OSS Explorer

A **SWECC Labs** project: a polished, searchable browser for open issues across
**SWECC's own repos** and the **~100 most active open-source projects on GitHub** —
available as a Python CLI and a web app.

Think "good first issue" aggregator, but with actual UX.

## Philosophy

**Nothing is stored, anywhere.** There is no database, no cache server, no
background crawler. Every search hits the [GitHub REST API](https://docs.github.com/en/rest/search)
live and shows you exactly what GitHub sees right now. The only thing ever saved
is an *optional* personal access token, and that lives in **your own browser's
localStorage** — never on a server.

| Surface | What it is | Where it lives |
|---|---|---|
| CLI | `swecc-oss` — search issues from your terminal | `src/swecc_oss_explorer/` |
| Website | filterable, shareable issue browser | `web/` (static, zero build step) |

## Quickstart (CLI)

Requires Python 3.10+.

```bash
git clone https://github.com/swecc-uw/swecc-oss-explorer
cd swecc-oss-explorer
pip install -e .
```

```bash
# Open issues across all SWECC repos (default labels: good first issue, help wanted)
swecc-oss explore

# The same, but across the top 100 most active repos on GitHub
swecc-oss explore --scope top

# Python issues needing docs help in active projects, newest first
swecc-oss explore --scope top --label documentation --language python

# Free text search, JSON output for scripting
swecc-oss explore --scope all --query "pagination" --json
swecc-oss repos --scope top --json
```

GitHub allows **10 searches/minute** unauthenticated. Set `GITHUB_TOKEN` to raise
that to 30/minute — any token with no extra scopes works.

```bash
export GITHUB_TOKEN=ghp_yourtokenhere
```

## Website

The site is plain HTML/CSS/JS in [`web/`](web) — no build step, no framework,
no npm install. Open `web/index.html` in a browser or serve it:

```bash
python -m http.server 8000 --directory web
```

It deploys automatically to GitHub Pages via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
(enable **Settings → Pages → Source: GitHub Actions** once).

## How scope discovery works

Both surfaces build queries the same way — see [`src/swecc_oss_explorer/query.py`](src/swecc_oss_explorer/query.py):

- **`swecc` scope** — one search with `org:swecc-uw`: every SWECC repo, full coverage.
- **`top` scope** — GitHub caps search queries at 256 characters, so OR-ing 100
  `repo:` qualifiers in one query isn't possible. Instead we (1) discover the
  top repos with a single stars + recency heuristic
  (`stars:>5000 pushed:>=last-30-days`, sorted by stars), (2) greedily pack
  them into `repo:`-qualifier batches that each fit the 256-char budget, and
  (3) run one live search per batch, merging and re-sorting the results. The
  website streams batches in as they arrive, so results appear progressively.

Both steps are live on every request. The activity heuristic is deliberately
simple and tracked in [#3](https://github.com/swecc-uw/swecc-oss-explorer/issues/3).

## Project structure

```
src/swecc_oss_explorer/
├── cli.py         # typer commands: explore, repos, web, version
├── github.py      # minimal stateless GitHub REST client
├── discovery.py   # SWECC repos + top-100-active heuristic
├── query.py       # query building (256-char budget, scoping rules)
└── explore.py     # chunked multi-repo search orchestration
web/
├── index.html     # single-page app shell
├── app.js         # live search, filters, URL sync, progressive batch search
└── styles.css     # dark GitHub-inspired theme
```

## Contributing

This repo is intentionally seeded with beginner-friendly issues so SWECC
members can make their first open-source contribution here. Start with
[issues labeled `good first issue`](https://github.com/swecc-uw/swecc-oss-explorer/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22),
then read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
