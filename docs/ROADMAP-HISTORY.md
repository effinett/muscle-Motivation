# Muscle Motivation — Roadmap Phase History

Append-only closure record for the canonical roadmap (`docs/ROADMAP.md`).

**Rules:**

- **Append-only.** Earlier rows are not rewritten. Never rewrite history to make it look cleaner.
- One record per **closed phase**, added at closure time (see `docs/ROADMAP.md` §12.5).
- **Never written automatically by CI.**
- Record only what repository evidence supports. Where a detail cannot be reconstructed from the
  repository or git history, write **`historical detail not reconstructed`** rather than guessing.

**Fields:** date · phase · status · merge SHA · major shipped scope · deferred-out scope ·
exit-criterion result.

> This file was initialized on 2026-08-14 during canonical-roadmap adoption. The phases below closed
> **before** the roadmap-governance process existed, so their records are reconstructed from git history
> and committed documentation. Their exit-criterion fields are marked accordingly — they were not
> evaluated against a written exit criterion at the time.

---

## 4.2 — Core Feature Reliability

| Field | Value |
|---|---|
| **Closed** | 2026-08-03 |
| **Status** | COMPLETE |
| **Closing SHA** | `c34f8d962021f5a23e63df032a39370869e75de5` — *feat(eval): Phase 4.2.11 — continuous-evaluation CI, direction-aware gate & governance* (merged `7a1c17b7748ebb869e1517b622cba7c674e2017a`, PR #1) |
| **Span** | 2026-07-13 (`299b74a`, Phase 4.2.1 design checkpoint) → 2026-08-03 |

**Major shipped scope**

- **Nutrition track.** Shared food-resolution core (`food-core.js`); candidate reranking
  (`food-ranking.js`, 4.2.2, `b6ead17`); confidence and clarification; correction memory
  (`food-memory.js`, 4.2.4); vague portion intelligence (`food-portion.js`, 4.2.5); meal-level reasoning
  (`food-meal.js`, 4.2.6); food-core hardening with tiered identity/intent/quality ranking signals (4.2.7);
  shared presentation core (`food-display.js`, 4.2.8, `47b9736`); the nutrition evaluation suite
  (4.2.9, `f0ccb42`); confidence and ambiguity hardening (4.2.10a–d, `3313349` → `d8ffeba`);
  continuous-evaluation CI with a direction-aware gate and baseline governance (4.2.11, `c34f8d9`).
- **Exercise track.** Shared exercise-intelligence foundation (`exercise-core.js`, 4.2.1E, `32abb43`);
  picker integration via shared search (4.2.1F, `1d91276`); canonical catalog expansion to 141 rows
  (4.2.1G, `921e8c8`); custom-exercise lifecycle (`exercise-custom.js`, 4.2.1H); discovery filters
  (`exercise-filters.js`, 4.2.1I); logging reliability (`exercise-log.js`, 4.2.1J); canonical/custom PR and
  logged identity (4.2.1K, `061d4e7`); picker filter mobile UX (4.2.1L, `d5f6484`).

**Deferred out of this phase**

- Exercise detail surface, exercise media, exercise favorites/recents, and the rule-based substitution
  engine — planned under later historical exercise phases, never built. Carried forward to
  **4.3.6H / 4.3.6I / 4.3.6J** and **5.1.6 / 5.1.7**.
- Legacy pre-4.2.1K custom `workout_exercises` rows remain name-keyed; the backfill deliberately did not
  guess ambiguous rows. See `docs/ROADMAP.md` §10.1.
- Nutrition open loops: portion-correction persistence and gram-edit capture; meal-context confidence
  gating (shipped default-off); word-order ranking sensitivity; yogurt fat-basis presentation ordering.
  Carried forward to **5.4.12–5.4.14**.
- Branch protection requiring the `verify` check — recorded as deferred in `.github/workflows/ci.yml` and
  still open. See "Open repository actions" below.

**Exit criterion** — no written exit criterion existed at the time. Evidence of completion: the
`npm run verify` gate is green in CI, and the committed evaluation baseline records 288 cases at 100%
scored pass rate with a 0% false-confidence rate (`nutrition-evaluation/BASELINE.md`,
`nutrition-evaluation/HISTORY.md`).

---

## 4.3.1 — PWA Install Foundation

| Field | Value |
|---|---|
| **Closed** | 2026-08-03 |
| **Status** | COMPLETE |
| **Merge SHA** | `c04e64c9f73b69050659c3f1dad4676d133e66e3` (PR #2), implementation `1d6248a9b35fb18afeab41f0799f54593a9a263d` |
| **Follow-up** | `b8285a84f77290fbcbd4937a6400b8537ef552b1` (PR #3) — `848b3e6` iPhone PWA rest-timer / safe-area fix |

**Major shipped scope** — `manifest.webmanifest`; the generated icon set including maskable variants and
`apple-touch-icon`; root `favicon.ico`; a dependency-free icon generator; per-page head metadata on every
root HTML page except `calculator.html`; manifest content-type headers; static validation tests. Design
record: `docs/pwa-foundation.md`.

**Deferred out of this phase** — Android install validation (carried to **4.3.5K**). Deliberately shipped
with no service worker, no Cache Storage, no offline behavior, no background sync, no push, and no
install-prompt UI.

**Exit criterion** — no written exit criterion at the time. The app became installable with stable
manifest identity and no caching surface.

---

## 4.3.2 — Service Worker & Update Safety

| Field | Value |
|---|---|
| **Closed** | 2026-08-06 |
| **Status** | COMPLETE |
| **Merge SHA** | `a9d93ef2831f8e891b16cf1eaa6e6d140e2ab6f5` (PR #4) |
| **Span** | `49c4350434be06564346dfd1524f2650573489b6` (2026-08-03, cache-policy core) → `c8f56e5da5e6d6037ffb9319281665b73017c90a` (2026-08-04, controlled updates) |

**Major shipped scope** — `sw-policy.js` as the single source of truth for the frozen static allowlist,
`mm-static-vN` cache naming, and default-deny request eligibility; `sw.js` + `sw-runtime.js` worker runtime
that fails safe by attaching no listeners if policy load fails; registration, update detection, and a
user-controlled refresh flow with an explicit **Update now / Later** banner; bottom-control clearance
measurement; a session reload-loop guard; `updateViaCache: 'none'` plus script revalidation headers.

Privacy boundary held throughout: HTML navigations, `/api/*`, Supabase auth/session state, and any
authorization-bearing request are never cached or intercepted. `skipWaiting()` only ever runs from an
explicit user action.

**Deferred out of this phase**

- Shared app-wide dirty-state / unsaved-work registry — carried forward to **4.3.5G**.
- Canonical production hostname confirmation (apex vs `www`) for the registration guard — carried forward
  to **4.3.5H**.

**Exit criterion** — no written exit criterion at the time. Safe update lifecycle with versioned caches and
an intact privacy boundary.

---

## 4.3.3 — Install Onboarding & Update UX

| Field | Value |
|---|---|
| **Closed** | 2026-08-09 |
| **Status** | CLOSED |
| **Merge SHA** | `b20ff3a6b5149816ed2e2537d5e00f979e411b72` (PR #5); cache-version validation follow-up `e0f52c865045ebb7767f1d85632b71e84198eecf` (PR #6, `8e4214b`) |
| **Span** | `67e72b8a7c2e3a5c2f1e4d7407ddc7791e987a5a` (2026-08-07) → 2026-08-09 |

**Major shipped scope** — shared install-eligibility core (`pwa-install.js`); install onboarding UI
(`pwa-install-ui.js`); install lifecycle and value-signal wiring (`pwa-install-register.js`); service-worker
update-UX hardening (`05b06ef`) including corrected update-banner `aria-busy` semantics; workout-completion
signal validation and bootstrap guarding.

**Production validation** — completed, including desktop and installed-iPhone update behavior. All
verification and privacy guarantees from this phase are preserved.

**Deferred out of this phase** — Android install validation remained open; carried to **4.3.5K**.

**Exit criterion** — no written exit criterion at the time. Real-device production validation of the
install and update flows was completed before closure.

---

## 4.3.4 — Dashboard 2.0 & App Navigation

| Field | Value |
|---|---|
| **Closed** | 2026-08-12 |
| **Status** | CLOSED |
| **Merge SHA** | `eb506d38de3da06dded5cd64b46fea4c76c554d9` (PR #8) |

**Major shipped scope** — premium mobile-first Home with a consolidated header and reduced clutter;
Today's Plan as Home's primary action; weekly training progress from real workout history; Calories +
Protein nutrition snapshot; deterministic Coach Insight (the precursor to the AI Coach); progress snapshot
with weight and trend; **Home / Train / Nutrition / Progress** bottom navigation via a data-driven route
registry (`app-nav.js`); the app-shell CSS layer (`app-shell.css`) with one bottom-clearance strategy plus
skip link, visually-hidden helper, focus-visible ring, and a reduced-motion block; shared program/session
state (`program-state.js`) and dashboard model (`dashboard-model.js`); theme-token foundation; modular
dashboard architecture.

**Integration contracts established** (later phases must preserve these): the rendered nav carries
`data-mm-sw-bottom-control`, which the 4.3.2/4.3.3 update banner and install sheet already query;
`--mm-nav-base-height` / `--mm-bottom-clearance` are the one bottom-clearance strategy. A **Coach**
destination is reserved in the registry with `available: false` and renders nothing until 4.4 ships.

**Deferred out of this phase**

- Dashboard customization and module reordering — **4.9.1 / 4.9.2**.
- Optional Carbs/Fat on Home — **4.9.3**; Calories + Protein remains the default.
- Nutrition zero-state currently replaces the module with "Nothing logged yet today" instead of showing
  empty progress tracks — carried to **4.3.5A**.

**Exit criterion** — no written exit criterion at the time. The current app-shell architecture was
established and is the foundation 4.3.5 hardens.

---

# Open repository actions

Tracked here because they are repository-level obligations rather than product phases.

## Branch protection — `verify` required on `main` · **OPEN**

**Required by** `docs/ROADMAP.md` §2.2 (Engineering Invariants). This precedes 4.3.5 implementation; it is
deliberately not a paid-launch item.

**Why it is not done:** GitHub branch-protection settings cannot be changed from the development
environment. Attempted again on **2026-08-14** during pre-4.3.5 repository setup and confirmed
blocked on three counts: the `gh` and `hub` CLIs are not installed; the available GitHub tooling
exposes repository, branch, file, issue, and pull-request operations but **no branch-protection or
ruleset API**; and no GitHub API token is present in the environment for a direct REST call (git
authenticates over SSH, which cannot be used for the REST settings endpoint).

This requires a repository administrator acting in the GitHub web UI.

**Exact remaining manual step** (repository administrator, once):

1. Open `https://github.com/effinett/muscle-Motivation/settings/branches`.
2. **Add branch protection rule** (or edit the existing rule) with branch name pattern `main`.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging**, then enable **Require branches to be up to
   date before merging**.
5. In the status-check search box, select the check named exactly **`verify`**
   (workflow *Continuous Evaluation*, `.github/workflows/ci.yml`).
6. Save.

Once configured, append a dated note to this section recording who enabled it and when. Do not mark it
complete until it is actually configured.

---

# Roadmap decisions

Decisions that change roadmap scope or targets without closing a phase.

## 2026-08-14 — Phase 4.3.5F navigation-performance target defined

**Decision:** 4.3.5F now carries an explicit requirement, a measured starting point, and provisional
numeric targets (`docs/ROADMAP.md` → 4.3.5F). Recorded so "effectively instantaneous" has a concrete
boundary and cannot drift into an unapproved architecture change.

**Static audit taken before any implementation** (unminified source as served; no build step):

- Every destination reloads **133 KB** of shared same-origin JS + **35 KB** of `app-shell.css` and
  re-fetches **two cross-origin CDN scripts** (lucide via unpkg, supabase-js via jsdelivr) with **no
  `preconnect`**.
- Per-destination totals: Home ~289 KB · Train ~463 KB · **Nutrition ~634 KB** · Progress ~226 KB.
- The service worker's `STATIC_ALLOWLIST` is frozen to five icon paths, so **no HTML/CSS/JS is
  cache-eligible today**; the two CDN scripts are cross-origin and cannot enter a same-origin
  allowlist without a separate approved policy change.
- The only resource hints in the app are two font `preconnect`s — no route prefetch, no CDN or
  Supabase `preconnect`.

**Targets set:** tap acknowledged ≤ 100 ms (hard) · warm repeat navigation ≤ 600 ms p75 · first
navigation ≤ 1200 ms p75 · zero white flashes · zero duplicate shared-bootstrap initialization.
Measured on a mid-tier Android device, judged on Nutrition as the worst case.

**Explicitly recorded guard:** the two latency numbers are engineering targets, not contractual
thresholds. If the device baseline shows either is unreachable inside the current multi-page
architecture, **the target is revised — the architecture is not escalated.** SPA conversion, a
navigation rewrite, a route-system replacement, and an app-shell rebuild all remain outside 4.3.5 and
require separate explicit approval.

No implementation was performed; 4.3.5 has not started.
