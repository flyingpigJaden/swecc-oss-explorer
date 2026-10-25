/* SWECC OSS Explorer — everything is fetched live from the GitHub REST API.
   No backend, no database, nothing persisted anywhere except an optional
   personal access token kept in YOUR browser's localStorage. */

"use strict";

const API = "https://api.github.com";

// Must mirror src/swecc_oss_explorer/discovery.py — keep them in sync.
const TOP_REPO_MIN_STARS = 5000;
const TOP_REPO_PUSHED_WITHIN_DAYS = 30;
const DEFAULT_LABELS = ["good first issue", "help wanted"];
const PER_PAGE = 30;

const state = {
  scope: "top",            // top | all
  labels: [...DEFAULT_LABELS],
  age: 61,                 // max issue age in days (2 months); "" = any age
  language: "",
  sort: "created",
  q: "",
  page: 1,
  token: localStorage.getItem("gh_token") || "",
  topRepoNames: null,      // Set<string>, resolved lazily for the "top" scope
};

const $ = (sel) => document.querySelector(sel);

/* Inline SVG icons (feather-style, stroke = currentColor). */
const ICONS = {
  comment:
    '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  user:
    '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  external:
    '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  alert:
    '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  clock:
    '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};

const els = {
  search: $("#search"), language: $("#language"), sort: $("#sort"), age: $("#age"),
  results: $("#results"), banner: $("#banner"), metaRow: $("#meta-row"),
  resultCount: $("#result-count"), scopeNote: $("#scope-note"),
  empty: $("#empty-state"), loadMoreWrap: $("#load-more-wrap"),
  loadMore: $("#load-more"),
  tokenBtn: $("#token-btn"), tokenDialog: $("#token-dialog"),
  tokenInput: $("#token-input"), tokenForm: $("#token-form"),
  reset: $("#reset-btn"),
};

/* ---------- helpers ---------- */

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function age(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function repoOf(item) {
  return (item.repository_url || "").replace("https://api.github.com/repos/", "");
}

// Deterministic avatar color + initial per repo (no extra API calls needed).
// Palette = @swecc/ui token colors (see styles.css).
function avatarFor(fullName) {
  const colors = ["#7ea266", "#d5c6f8", "#d96b6b", "#ffbd2e", "#484a4d", "#27c93f", "#a7aab1", "#d7d4d0"];
  let hash = 0;
  for (const ch of fullName) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initial = fullName.replace(/.*\//, "")[0] || "?";
  return { color: colors[hash % colors.length], initial: initial.toUpperCase() };
}

function labelPill(label) {
  const c = /^([0-9a-f]{6})$/i.test(label.color || "") ? label.color : "8b949e";
  const style = `background:#${c};color:${luma(c) > 140 ? "#111" : "#fff"};border-color:#${c}55`;
  return `<span class="pill" style="${style}">${escapeHtml(label.name)}</span>`;
}

function luma(hex) {
  const n = parseInt(hex, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

function excerpt(body) {
  const text = (body || "").replace(/[#>*`\[\]!-]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 140 ? text.slice(0, 140) + "…" : text;
}

/* ---------- API ---------- */

async function gh(path, params) {
  const url = new URL(API + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { Accept: "application/vnd.github+json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const mins = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : 1;
    throw new RateError(
      `Try again in ~${mins} min, or <a href="#" id="open-token">add a token</a> for 30/min.`
    );
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

class RateError extends Error {}

/* ISO date (YYYY-MM-DD) N days ago, for the `created:>=` qualifier. */
function createdSince(days) {
  if (days === "" || days == null) return "";
  return new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10);
}

/* ---------- query building (mirrors src/swecc_oss_explorer/query.py) ---------- */

function issueQuery() {
  const parts = ["is:issue", "is:open"];
  for (const l of state.labels) parts.push(`label:"${l}"`);
  const since = createdSince(state.age);
  if (since) parts.push(`created:>=${since}`);
  if (state.language) parts.push(`language:${state.language}`);
  if (state.q) parts.push(state.q);
  return parts.join(" ");
}

function topRepoQuery() {
  const since = new Date(Date.now() - TOP_REPO_PUSHED_WITHIN_DAYS * 86400000).toISOString().slice(0, 10);
  return `stars:>${TOP_REPO_MIN_STARS} pushed:>=${since} archived:false`;
}

/* ---------- rendering ---------- */

function skeletonGrid(n = 9) {
  els.results.innerHTML = Array.from({ length: n }, () => `<div class="skeleton"></div>`).join("");
}

function render(issues, { appended = false } = {}) {
  const html = issues.map((it) => {
    const repo = repoOf(it);
    const { color, initial } = avatarFor(repo);
    const labels = (it.labels || []).slice(0, 4).map(labelPill).join("");
    const excerptHtml = excerpt(it.body)
      ? `<p class="card-excerpt">${escapeHtml(excerpt(it.body))}</p>`
      : "";
    return `
      <article class="card">
        <div class="card-top">
          <span class="avatar" style="background:${color}">${initial}</span>
          <span class="repo-name" title="${escapeHtml(repo)}">${escapeHtml(repo)}</span>
          <span class="spacer"></span>
          <span class="issue-num">#${it.number}</span>
        </div>
        <h3 class="card-title"><a href="${it.html_url}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h3>
        ${excerptHtml}
        <div class="labels">${labels}</div>
        <div class="card-footer">
          <span class="meta-item" title="Opened ${escapeHtml(it.created_at)}">${age(it.created_at)}</span>
          <span class="meta-item" title="Comments">${ICONS.comment} ${it.comments ?? 0}</span>
          <span class="meta-item" title="Author">${ICONS.user} ${escapeHtml(it.user?.login || "ghost")}</span>
          <span class="spacer"></span>
          <a href="${it.html_url}" target="_blank" rel="noopener" class="card-link">${ICONS.external} Open</a>
        </div>
      </article>`;
  }).join("");

  if (appended) els.results.insertAdjacentHTML("beforeend", html);
  else els.results.innerHTML = html;
}

function showBanner(html, isError = false) {
  const icon = isError ? ICONS.alert : ICONS.clock;
  els.banner.innerHTML = `${icon}<span class="banner-text">${html}</span>`;
  els.banner.classList.toggle("error", isError);
  els.banner.classList.remove("hidden");
}

/* ---------- search flow ---------- */

let searchSeq = 0;
let lastTotal = 0;

// Mirrors src/swecc_oss_explorer/explore.py — greedy packing under the
// 256-char GitHub search limit. Keep in sync with the Python side.
function chunkRepos(names, budget = 250) {
  const chunks = [];
  let current = [], used = 0;
  for (const name of names) {
    const cost = `repo:${name} `.length;
    if (current.length && used + cost > budget) { chunks.push(current); current = []; used = 0; }
    current.push(name);
    used += cost;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function ensureTopRepos() {
  if (state.topRepoNames) return state.topRepoNames;
  const data = await gh("/search/repositories", { q: topRepoQuery(), sort: "stars", per_page: 100 });
  state.topRepoNames = data.items.map((r) => r.full_name);
  return state.topRepoNames;
}

async function runSearch({ resetPage = true } = {}) {
  const seq = ++searchSeq;
  if (resetPage) state.page = 1;

  els.banner.classList.add("hidden");
  els.empty.classList.add("hidden");
  els.loadMoreWrap.classList.add("hidden");
  if (resetPage) skeletonGrid(9);

  try {
    if (state.scope === "top") {
      await runTopScopeSearch(seq);
    } else {
      await runSingleQuerySearch(seq, { resetPage });
    }
  } catch (err) {
    if (seq !== searchSeq) return;
    if (err instanceof RateError) showBanner(`GitHub search rate limit hit. ${err.message}`);
    else showBanner(`${escapeHtml(err.message)} — check your connection and try again.`, true);
  }
}

/* Single-query scope: "all" (global). Paginated. */
async function runSingleQuerySearch(seq, { resetPage }) {
  const data = await gh("/search/issues", {
    q: issueQuery(),
    sort: state.sort,
    order: "desc",
    per_page: PER_PAGE,
    page: state.page,
  });
  if (seq !== searchSeq) return;
  lastTotal = Math.min(data.total_count, 1000); // GitHub caps search results at 1000

  const issues = data.items || [];
  els.scopeNote.textContent = "every public repo on GitHub";
  updateMeta(issues.length, resetPage);

  if (issues.length) render(issues, { appended: !resetPage });
  else if (resetPage) els.empty.classList.remove("hidden");

  els.loadMoreWrap.classList.toggle("hidden", !(state.page * PER_PAGE < lastTotal));
  els.loadMore.textContent = `Load more (page ${state.page + 1} of results)`;
}

/* "top" scope: no single query can cover 100 repos (256-char limit), so we
   search repo-batches one at a time and stream results in as they arrive. */
async function runTopScopeSearch(seq) {
  const repos = await ensureTopRepos();
  if (seq !== searchSeq) return;
  const base = ["is:issue", "is:open", ...state.labels.map((l) => `label:"${l}"`),
    createdSince(state.age) && `created:>=${createdSince(state.age)}`,
    state.language && `language:${state.language}`, state.q].filter(Boolean).join(" ");
  const chunks = chunkRepos(repos, 256 - base.length - 1);

  els.scopeNote.textContent = `searching ${repos.length} most-active repos in ${chunks.length} live batches`;
  const seen = new Set();
  let shown = 0;

  for (let i = 0; i < chunks.length; i++) {
    if (seq !== searchSeq) return;
    updateBatchProgress(i, chunks.length);
    const query = `${base} ${chunks[i].map((r) => `repo:${r}`).join(" ")}`;
    const data = await gh("/search/issues", {
      q: query, sort: state.sort, order: "desc", per_page: PER_PAGE,
    });
    if (seq !== searchSeq) return;
    const issues = (data.items || []).filter((it) => !seen.has(it.id) && seen.add(it.id));
    if (issues.length) {
      render(issues, { appended: shown > 0 });
      shown += issues.length;
      updateMeta(shown, true);
    }
  }
  if (shown === 0) els.empty.classList.remove("hidden");
  els.scopeNote.textContent = `searched all ${repos.length} most-active repos`;
}

function updateMeta(count, resetPage) {
  els.resultCount.textContent = `${count}${resetPage ? "" : " more"} issue${count === 1 ? "" : "s"} shown`;
  els.metaRow.classList.remove("hidden");
}

function updateBatchProgress(done, total) {
  els.resultCount.textContent = `searching batch ${done + 1}/${total}…`;
  els.metaRow.classList.remove("hidden");
}

/* ---------- URL <-> state sync (shareable filters) ---------- */

function applyUrlParams() {
  const p = new URLSearchParams(location.search);
  if (["top", "all"].includes(p.get("scope"))) state.scope = p.get("scope");
  if (p.has("labels")) state.labels = p.get("labels").split(",").filter(Boolean);
  if (["7", "14", "30", "61", "182", "365", ""].includes(p.get("age"))) {
    state.age = p.get("age") === "" ? "" : Number(p.get("age"));
  }
  if (p.get("lang")) state.language = p.get("lang");
  if (["created", "updated", "comments", "reactions"].includes(p.get("sort"))) state.sort = p.get("sort");
  if (p.get("q")) state.q = p.get("q");
}

function syncUrlParams() {
  const p = new URLSearchParams();
  if (state.scope !== "top") p.set("scope", state.scope);
  if (state.labels.join() !== DEFAULT_LABELS.join()) p.set("labels", state.labels.join(","));
  if (String(state.age) !== "61") p.set("age", String(state.age));
  if (state.language) p.set("lang", state.language);
  if (state.sort !== "created") p.set("sort", state.sort);
  if (state.q) p.set("q", state.q);
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
}

/* ---------- wiring ---------- */

function bindChips(containerSel, attr, onChange) {
  document.querySelectorAll(`${containerSel} .chip`).forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("active");
      onChange(chip);
      syncUrlParams();
      runSearch();
    });
  });
}

function reflectState() {
  document.querySelectorAll("#scope-chips .chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.scope === state.scope));
  document.querySelectorAll("#label-chips .chip").forEach((c) =>
    c.classList.toggle("active", state.labels.includes(c.dataset.label)));
  els.age.value = String(state.age);
  els.language.value = state.language;
  els.sort.value = state.sort;
  els.search.value = state.q;
}

let debounceTimer;
els.search.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    state.q = els.search.value.trim();
    syncUrlParams();
    runSearch();
  }, 400);
});

bindChips("#scope-chips", "scope", (chip) => { state.scope = chip.dataset.scope; state.topRepoNames = null; });
bindChips("#label-chips", "label", (chip) => {
  const l = chip.dataset.label;
  state.labels = chip.classList.contains("active")
    ? [...state.labels, l]
    : state.labels.filter((x) => x !== l);
});

els.language.addEventListener("change", () => { state.language = els.language.value; syncUrlParams(); runSearch(); });
els.age.addEventListener("change", () => {
  state.age = els.age.value === "" ? "" : Number(els.age.value);
  syncUrlParams(); runSearch();
});
els.sort.addEventListener("change", () => { state.sort = els.sort.value; syncUrlParams(); runSearch(); });
els.reset.addEventListener("click", () => {
  Object.assign(state, { scope: "top", labels: [...DEFAULT_LABELS], age: 61, language: "", sort: "created", q: "" });
  reflectState(); syncUrlParams(); runSearch();
});
els.loadMore.addEventListener("click", () => { state.page += 1; runSearch({ resetPage: false }); });

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== els.search) { e.preventDefault(); els.search.focus(); }
});

/* ---------- token dialog ---------- */

els.tokenBtn.addEventListener("click", () => {
  els.tokenInput.value = state.token;
  els.tokenDialog.showModal();
});
els.tokenForm.addEventListener("submit", (e) => {
  if (e.submitter?.value === "save") {
    state.token = els.tokenInput.value.trim();
    if (state.token) localStorage.setItem("gh_token", state.token);
    else localStorage.removeItem("gh_token");
    updateTokenButton();
    runSearch();
  }
});
updateTokenButton();

function updateTokenButton() {
  $("#token-label").textContent = state.token ? "Token set" : "Token";
  els.tokenBtn.classList.toggle("btn-outline", Boolean(state.token));
}

document.addEventListener("click", (e) => {
  if (e.target.id === "open-token") { e.preventDefault(); els.tokenBtn.click(); }
});

/* ---------- boot ---------- */

applyUrlParams();
reflectState();
runSearch();
