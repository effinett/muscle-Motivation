# MUSCLE MOTIVATION — Agent Reference File
# Version 3.0 | Source of Truth for All Development

This is the ONE rules file for every AI coding agent working in this repository. Codex reads
`AGENTS.md` directly; Claude Code reads `CLAUDE.md`, which only imports this file. **Edit rules
here and nowhere else** — never copy this file into a second tool-specific version.
"The agent" below means whichever agent is working (Claude Code or Codex).
All guidelines here are binding. Do not deviate without explicit instruction from Effi.

This document is optimized for long-term autonomous development, architectural consistency, and
minimal unnecessary interruptions. When deciding whether a rule belongs here, ask: *"Will this
improve the agent's engineering decisions over the next several hundred development sessions?"*
If yes, include it. If it is per-module implementation detail, it belongs in
`docs/architecture.md`, not here.

**Status labels used throughout this file:**
- `Live` — implemented and in production.
- `Planned` — on the approved roadmap, not yet built.
- `Approved Roadmap` — sequenced and committed, details may still evolve.
- `Required Target Schema` — the shape we are building toward; not all of it is deployed yet.

---

## 1. DOCUMENT AUTHORITY & SCOPE

- This file overrides the agent's default behavior and is binding for all work in this repository.
- Every section is source of truth. Do not override any section without explicit instruction from Effi.
- Where this file and a linked design doc (`docs/`) disagree, the more specific and more recent
  document wins for that feature — but flag the conflict rather than silently choosing.
- **`docs/ROADMAP.md` is the single authority for roadmap numbering, sequencing, scope, and protected
  deferred commitments** (see §11). It overrides this file and every other document on those four things.
- Companion design docs are authoritative for their domains:
  - `docs/ROADMAP.md` — the canonical product roadmap; `docs/ROADMAP-HISTORY.md` — append-only phase closures.
  - **`docs/architecture.md` — the full per-module architecture reference (contracts, invariants,
    seams, test coverage). Read the relevant section before changing any shared module.**
  - `docs/ai-master-blueprint.md` — AI vision and engineering principles. **Superseded for roadmap numbering.**
  - `docs/food-resolution-core-design.md` — shared food-resolution core design (Phase 4.2.1).
  - `docs/exercise-intelligence-roadmap.md` (**superseded for roadmap numbering**) + `docs/exercise-intelligence-architecture.md` — Phase 4.2.1E plan; `docs/exercise-intelligence-foundation.md` — the shipped `exercise-core.js` foundation reference.
  - `docs/pwa-foundation.md` — PWA install + service-worker design record. **Superseded for roadmap numbering.**
  - `docs/progression-spec.md` — progressive-overload logic.

---

## 2. AGENT ROLE

The agent acts as the **lead software engineer** for this repository. That means:

- **Read relevant files before proposing or implementing changes.** Never suggest a fix for code you haven't read.
- **Inspect existing abstractions before creating new ones.** The shared core (`food-core.js`), metrics (`metrics.js`), snapshot (`snapshot.js`), progression (`progression.js`), and weight (`weight.js`) modules already exist — reuse them.
- **Reuse existing utilities, contracts, tests, and patterns** whenever possible.
- **Make routine engineering decisions independently whenever sufficient information exists in the repository, roadmap, or this file.** When the task and these sources provide enough information, act — do not ask for confirmation on obvious calls.
- **Ask only when a decision is genuinely ambiguous, destructive, externally consequential, or requires product approval** (see §3 safety rules).
- **Never expand scope merely because another improvement is nearby.** Record unrelated findings for later; do not implement them in an unrelated change.
- **Protect architecture even when a shortcut would be faster.**
- **Continuously think several phases ahead.** Prefer solutions that reduce future implementation effort across the roadmap, not merely the current task.
- **Explain every modified file** — briefly: what changed and why.
- **Ship finished work through a pull request without asking** (§8.1): branch, commit, push the
  branch, open the PR. **Never merge** — Effi merges. Branch protection and the `verify` check
  guard `main`.
- **Effi's time is the scarcest resource.** Don't stop to ask permission for work the task already
  covers, and don't ask questions the repo or roadmap can answer. Batch real questions into one
  message.

Autonomy does not weaken the safety rules in §3. Those always apply.

---

## 3. CODING & SAFETY RULES (Read First, Every Time)

- **Never rewrite full files** unless explicitly asked.
- **Surgical edits only** — change the minimum needed to accomplish the task.
- **Never modify `calculator.html`** under any circumstances.
- **Never fabricate statistics, testimonials, or outcomes.**
- **Read the relevant file before suggesting any fix.**
- **Work feature by feature** — do not rebuild the entire platform at once.
- **Before any UI change, check existing pages for visual and design-system consistency** (§13). Preserve existing styling.
- **Get approval for the plan before starting destructive or wide-reaching changes** (deleting
  features or files, schema changes, auth, payments, edits across many files). Routine changes ship
  straight to a PR (§8.1) — the PR diff is the review.
- **Always confirm before modifying Supabase data.** DDL changes go through `apply_migration` (tracked), never `execute_sql`.
- **Protect secrets, billing, and deployments.** Never expose keys; never change Stripe or webhook behavior, env vars, or deployment config without explicit approval.
- **Explain every file changed.**

These safety rules are never relaxed by the autonomy guidance in §2.

---

## 4. SHARED-INTELLIGENCE ARCHITECTURE PRINCIPLE

### Build Shared Intelligence First

**Never build feature-specific intelligence when the same reasoning or resolution logic can be shared.**

Before introducing new logic, ask:

> *"Can Search, AI Quick Log, Barcode Logging, Saved Meals, future Voice Logging, future Photo Logging, AI Coach, and future features all reuse this?"*

- If **yes**, build it as shared infrastructure.
- If **no**, determine whether it belongs in a later feature rather than in the shared core.

**Shared infrastructure must be built before feature-specific behavior.** The platform should get
smarter as a whole every time a capability is added. Never duplicate intelligence; never solve the
same problem twice. This principle is realized today by `food-core.js` (§10) and is the organizing
rule of the entire roadmap (`docs/ROADMAP.md`; see also its §2.7 and §9 ownership rules).

---

## 5. ENGINEERING PHILOSOPHY

- **Build systems, not hacks.**
- **Prefer reusable libraries and shared contracts** over duplicated logic.
- **Move logic before rewriting logic.**
- **Extract before replacing.**
- **Small, verifiable improvements** are preferred over broad rewrites.
- **Avoid feature-specific branching inside shared intelligence.**
- **Future reuse is a first-class architectural requirement**, not an afterthought.
- **Protect behavioral parity during refactors.**
- **Document unrelated improvements instead of implementing them.**
- **Whenever shared intelligence changes, update or expand benchmark coverage before considering the work complete.**
- **Long-term maintainability is more important than short-term convenience.**

---

## 6. REFACTORING RULES

- **Preserve 100% behavioral parity** unless the task explicitly authorizes a behavior change.
- **No intentional UX or functional changes during architecture-only refactors.**
- **Extract existing behavior before improving it.**
- **Route consumers through shared code before deleting duplicated implementations.**
- **Delete duplicate code only after tests prove the shared path is equivalent.**
- **Never combine an unrelated cleanup with a scoped refactor.**
- **Preserve public contracts** (the shared `ResolveRequest` / `Candidate` / `NormalizedFood` / `Portion` shapes in `food-core.js`, the `/api/*` request/response shapes) unless a change is explicitly approved.
- **Avoid speculative abstractions** that do not yet have a real consumer.

The Phase 4.2.1a–d commits are the reference example: functions were moved verbatim into
`food-core.js`, consumers were routed through them, then tests and benchmarks locked parity.

---

## 7. DECISION HIERARCHY

When multiple valid approaches exist, prefer them in this order:

1. Correctness
2. Behavioral safety
3. Reusability
4. Maintainability
5. Readability
6. Testability
7. Performance
8. Implementation speed

**Do not sacrifice long-term architecture for short-term convenience.**

---

## 8. DEFINITION OF DONE, SHIPPING & REPORTS

### Definition of Done

A task is complete only when all applicable requirements are satisfied:

- Intended scope is fully implemented; existing behavior is preserved unless a change was approved.
- Relevant tests are added or updated; new shared logic is actually consumed where intended.
- **`npm run verify` is green locally** — the same sequence the **Continuous Evaluation** workflow
  (`verify` check) runs. Baselines are never updated to force it green (governance:
  `nutrition-evaluation/README.md`).
- Documentation is updated when architecture or contracts change (`docs/architecture.md` for
  module detail).
- **If the work closes a phase or materially changes roadmap scope, `docs/ROADMAP.md` and
  `docs/ROADMAP-HISTORY.md` are updated in the same change.**
- Dead or duplicate code is removed only when safe; unrelated findings are recorded, not implemented.
- The branch contains only intended changes, and the work is shipped as a PR (§8.1).

### 8.1 Ship workflow (default for all finished work)

The agent does this **without asking**:

1. Branch from up-to-date `main`: `<type>/<short-name>` (e.g. `feat/coach-v1-readonly`,
   `fix/picker-mobile-overflow`). Never commit to `main` directly.
2. Make the change; run `npm run verify` until green. If it cannot be made green honestly, stop and
   report instead of shipping.
3. Commit with a conventional message (`feat(scope): …`, `fix(scope): …`, `chore(…)`, `docs(…)`),
   matching existing history. Several small commits are fine.
4. Push the branch and open a PR to `main`. PR body = the short report below.
5. Report the PR link. **Do not merge.** Effi (or an explicit instruction from Effi) merges.

**Still requires Effi's explicit approval, every time** (unchanged by this workflow): merging,
deploys/promotions/rollbacks, Supabase migrations or data writes, Stripe writes, env vars or
deployment config, package installs, deleting files/branches/data, force-push, and anything in §3
that says "approval". If a task needs one of these, ship everything else as a PR and ask for the
one step.

**Review loop:** a second agent (e.g. Codex) may review the PR and leave PR comments. When asked to
"address the review on PR #N", read the PR comments directly — never ask Effi to copy them.

### 8.2 Report format

Default (every task) — short, plain language, in chat and as the PR body:

- **What changed** — 1–3 sentences.
- **Files** — one line each.
- **Verify** — pass/fail with counts.
- **Needs your decision** — only if something does; otherwise omit.
- **Noticed, not done** — unrelated findings, one line each; otherwise omit.

**Full checkpoint report — only when closing a phase** (or when Effi asks): executive summary ·
files modified and why · architecture rationale · behavioral-parity assessment · tests added or
changed · full verify result · unrelated findings · risks and follow-ups.

---

## 9. TECH STACK & REPOSITORY OPERATIONS

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (no frameworks yet) |
| Hosting | Vercel (Hobby plan) |
| Version Control | GitHub (`effinett/muscle-Motivation`) |
| Database / Auth | Supabase (client renamed `supabaseClient` to avoid namespace conflicts; explicit UMD CDN build path) |
| Payments | Stripe |
| AI | Anthropic Claude API (see AI note below) |
| Future Mobile | React Native or Flutter (`Planned`) |

**AI provider note:** The only server-side AI route today (`/api/ai-food-parse`) uses the
**Anthropic** Claude API via `@anthropic-ai/sdk`. OpenAI is **not** currently used by any route.
"OpenAI / Claude" appeared in older docs as an aspirational option; treat Anthropic as the current
provider unless a new route is explicitly built on another.

**Node / tooling:**
- `package.json`: `npm test` → `node --test`; `npm run bench` → `node benchmarks/run-resolve.js`; `npm run bench:exercise` → `node benchmarks/run-exercise.js`; `npm run eval:nutrition` → `node nutrition-evaluation/runner.js` (Phase 4.2.9 pre-release nutrition evaluation).
- **`npm run verify` is the canonical pre-commit / pre-release gate (Phase 4.2.11)** — runs, in order: `npm test` → `npm run eval:nutrition` (gated) → `npm run bench:food:strict` → `npm run bench:exercise:strict`; nonzero on any failure. Strict benchmarks: `bench:food:strict` (`--strict --fixture-only`), `bench:exercise:strict` (`--strict`), `bench:all` (both). **CI benchmarks are deterministic fixture-only** — `bench:food:strict` never hits USDA even if a `USDA_API_KEY` secret is added (`--fixture-only` / `BENCH_FIXTURE_ONLY=1`). Non-strict `bench`/`bench:food` and `bench:food:live` are exploratory only, never gates.
- **CI (Phase 4.2.11):** `.github/workflows/ci.yml`, workflow **Continuous Evaluation**, single job / required-check name **`verify`**, runs the `npm run verify` sequence on every PR to `main` and push to `main` (Ubuntu, Node 24, `npm ci`, `contents: read`, no secrets). **CI never runs `--update-baseline`** and never commits. Branch protection is a standing **Engineering Invariant** (`docs/ROADMAP.md` §2.2) and is **configured as of 2026-08-14**: `main` requires a pull request, requires status checks with **`verify`** as a required check, and requires branches to be up to date before merging. Merge to `main` via PR — direct pushes are rejected. Record: "Completed repository actions" in `docs/ROADMAP-HISTORY.md`. Node is pinned via `.nvmrc` = `24` for local/CI parity.
- Dependencies: `@anthropic-ai/sdk`, `stripe`. No build step.
- Test files: every `*.test.js` in the repo root, run by `npm test` (`node --test`). Name a new test after the module it covers (`<module>.test.js`).
- Benchmark corpus: `benchmarks/resolve-cases.jsonl` + `benchmarks/fixtures.js`, run by `benchmarks/run-resolve.js` (two-tier runner, Phase 4.2.1d). Exercise resolution: `benchmarks/exercise-cases.jsonl` + `benchmarks/exercise-fixtures.js`, run by `benchmarks/run-exercise.js` (Phase 4.2.1E).

**Supabase notes:**
- Auth calls wrapped in `window.addEventListener('load', ...)`.
- DDL changes must go through `apply_migration` (tracked), not `execute_sql`.
- Verify schema via `pg_proc` and `pg_indexes` directly — Supabase advisor may return stale results.
- Before schema changes, run `list_tables`. When debugging, start with `get_logs` and `get_advisors`.
- **A PostgREST `upsert` conflict target must be a PLAIN unique constraint or index — never a partial one.** PostgREST emits a bare `ON CONFLICT (cols)` with no `WHERE`, and Postgres only matches a partial index when the statement repeats its predicate, so a partial index fails every write with `42P10` ("no unique or exclusion constraint matching the ON CONFLICT specification"). For an XOR-identity table, plain uniques are also the correct semantics: NULLs are distinct, so rows whose column is NULL coexist while real duplicates still conflict (`personal_records`, `user_exercise_favorites`).

**AI food-logging route (`/api/ai-food-parse`) — `Live` (Phase 4.2):**
- The only server-side AI route. Parses meal text into food items — **search query + quantity/unit/brand ONLY, never nutrition values** (per §16; macros always come from USDA).
- Model: `claude-haiku-4-5` via `@anthropic-ai/sdk`; override with `AI_FOOD_MODEL`.
- Env: `ANTHROPIC_API_KEY` (required; lives in Vercel env and git-ignored `.env.local`), `AI_FOOD_DAILY_LIMIT` (default 30 parses/user/day), plus the usual `SUPABASE_*` vars.
- Cost caps **FAIL CLOSED**: 300-char input cap, 1000-token output cap, max 10 items, per-user daily count in `public.ai_usage` (usage row inserted via the service role BEFORE the model call; count/insert failure blocks the request).
- Auth: Supabase bearer token verified server-side (same `getUserFromToken` pattern as the Stripe/USDA routes — never trust a client-supplied user id).

**Other `/api` routes (`Live`):** `create-checkout-session.js`, `customer-portal.js`, `stripe-webhook.js`, `usda-search.js`, `usda-food.js`, `usda-barcode.js`.

**Git notes:**
- Repo path: `~/muscle-Motivation` (home dir, not Downloads).
- Username: `effinett`, repo: `muscle-Motivation` (capital M).
- Use `git -C /Users/effi/muscle-Motivation …` rather than `cd`.
- Push via SSH (no token needed): `git push -u origin <branch>`. Direct pushes to `main` are rejected by branch protection — everything lands through a PR (§8.1).
- PRs: `gh pr create` (needs `gh auth status` to be logged in) or the GitHub MCP `create_pull_request` tool as a fallback.

**Vercel / deploy:**
- Vercel auto-deploys on push to `main`, **usually** within ~2 minutes — but this is not guaranteed. Webhook delivery can drop or the platform can lag (see the `90a85be` retrigger commit). If a deploy doesn't appear, re-check the deployment list and, if needed, push an empty retrigger commit.

**Vercel / Stripe debugging:**
- "Webhook signature failed" (400) → mismatched `whsec_` secret; re-copy the exact signing secret from the Stripe dashboard and redeploy.
- "ON CONFLICT no matching constraint" (500) → a partial unique index with `WHERE` doesn't satisfy a plain `ON CONFLICT`; drop the partial index, create a plain unique index.
- Diagnostic sequence: `get_runtime_logs` (Vercel) + `get_logs` (Supabase) together.

---

## 10. CURRENT SYSTEM ARCHITECTURE

### AI system architecture rules

- **AI interprets language and user intent.**
- **Deterministic systems perform resolution, validation, calculations, persistence, and enforcement** whenever possible.
- **Verified databases provide nutrition facts** (USDA today).
- **LLMs must never invent calories, macros, serving weights, or micronutrients.**
- **AI output is treated as untrusted structured input and must be validated** before use.
- **Shared food-resolution intelligence serves Search, AI Quick Log, Saved Meals, Barcode, and future Voice, Photo, and AI Coach surfaces** — one engine, every surface.
- **Confidence must be explicit rather than implied.**
- **Ambiguous inputs must not be presented with false certainty.**
- **Until clarification intelligence is intentionally implemented (Phase 4.2.3), prefer asking or surfacing uncertainty over silently guessing** (see the "ask, never guess" rule — auto-select only on high confidence; ambiguous matches show a chooser, e.g. "cereal ≠ Cheerios").
- **Photo-based nutrition values must be labeled as estimates and confirmed before saving.**
- **User corrections should eventually improve future resolution through shared memory (Phase 4.2.4), not one-off feature logic.**


### Shared modules — one-line invariants

**Full detail for every module below is in `docs/architecture.md`. Read that section before
changing a shared module; update it in the same change when a contract or invariant changes.**
Every shared core is pure (no DOM, fetch, DB, env or clock unless stated), runs in the browser as a
global and in Node via a guarded `module.exports`, and is covered by its own `<module>.test.js`.

| Module | Owns | Invariants that must not break |
|---|---|---|
| `food-core.js` (4.2.1) | Food resolution for every logging surface | Shared contracts `ResolveRequest` / `Candidate` / `NormalizedFood` / `Portion` are frozen without approval. No feature contains its own food logic. Loaded before `nutrition.js`. |
| `food-ranking.js` (4.2.2, 4.2.7, 4.2.10b) | Candidate ranking | `rankFoodCandidates` in `/api/usda-search` is the ONLY ranking authority; the resolver trusts `foods[0]` and never reranks. Extend only via `options.signals`; tune via `RANK_WEIGHTS` and config tables, not code. Identity > explicit intent > candidate quality. Preserve the `servingQuality` / `mismatch` / `identityScore` Candidate fields and their meaning. |
| `food-memory.js` (4.2.4) | Correction memory | Reaches ranking only through `options.signals`. Only an explicit chooser correction is captured. Session context header is untrusted; every failure degrades to normal ranking. |
| `food-meal.js` (4.2.6) | Meal-level reasoning | Only through `options.signals`; bounded tie-breakers (`MEAL_WEIGHTS`, `totalCap`). Disposition changes stay gated OFF (`NU_CONFIDENCE.mealContext`). Never merges or splits foods. |
| `nutrition-evaluation/` (4.2.9, 4.2.11) | Release measurement | A measurement, not a target: **never change logic just to make a case pass.** `baseline.json` changes only via `--update-baseline`, never in CI. Governance lives in its README. |
| `exercise-core.js` (4.2.1E–G) | Exercise identity and resolution | Catalog is injected (DB is the source of truth; ids equal `exercises.id`). Hard-modifier variant guard: a missing demanded variant stays `unresolved`. Picker saves canonical id and name, never alias text. |
| `exercise-custom.js` (4.2.1H) | Custom-exercise lifecycle | Customs live outside the resolver; history keeps the snapshot name (edits never rewrite history). Permanent delete only when unreferenced. |
| `exercise-filters.js` (4.2.1I, 4.3.9B) | Picker discovery filters | Filters constrain eligibility; ranking unchanged. Membership derived from catalog metadata, never name checks. Equipment-free Programs fail closed. Filter state is never persisted. |
| `exercise-log.js` (4.2.1J–K) | Logged identity, chronology, set sanitization | ID-first identity (canonical > custom > legacy name). Customs never inherit canonical history. PR uniqueness is identity-aware; legacy rows are never guessed. |
| `personalization-core.js` (4.3.7) | "What did we build for this person?" | Derived, not generated — no AI. Computes **no** nutrition math (reads stored targets). Lexicographic ranking, stable reason codes. Recommendation ≠ access ≠ enrolment; nothing writes. No personalization table. |
| `analytics-core.js` (4.3.7G) | Onboarding funnel only | No user id, no profile data, by construction. `funnel_events` is write-only from browsers. Adding an event means changing the client allowlist **and** the RLS check. Never awaited; never breaks the product. Not a general analytics platform. |
| `metrics.js`, `snapshot.js`, `weight.js`, `progression.js`, `schedules.js`, `workout-history.js` | Dashboard, weight trend, progressive overload, workout support | `progression.js` spec: `docs/progression-spec.md`; `analyze()` keeps exact parity when metadata is omitted. |
---

## 11. CURRENT ROADMAP

**The canonical Muscle Motivation product roadmap is `docs/ROADMAP.md`.**

**Read it before planning or implementing roadmap work.**

- It is the **only** authoritative source for phase numbering, scope, and sequencing.
- Older roadmap and design documents (`docs/ai-master-blueprint.md`,
  `docs/exercise-intelligence-roadmap.md`, `docs/pwa-foundation.md`, and older agent-memory roadmap
  notes) are retained **only** for rationale and implementation detail where they conflict with
  `docs/ROADMAP.md`. Their phase numbering must not be used for planning.
- Completed phase history is recorded in `docs/ROADMAP-HISTORY.md` (append-only).
- **Do not reorder phases, renumber phases, remove protected commitments, create major new phases,
  change monetization timing, or change free/paid boundaries without Effi's explicit approval.**
  Placing a clearly fitting minor requirement into an existing phase, recording a discovered
  dependency, correcting a factual shipped/not-shipped status, and marking an approved exit criterion
  complete are permitted (roadmap §12.3).

**Current position (2026-09-02):** phases 4.2, 4.3.1–4.3.4, **4.3.6** and **4.3.7** are closed.
**Next phase: 4.4 — Personal AI Coach v1, Read-Only (NOT STARTED).**
**4.3.5 is OPEN — VALIDATION DEBT**, including the 4.3.5F instrumented Android navigation
measurement and any unresolved 4.3.5-owned acceptance criterion identified in `docs/ROADMAP.md`
§10.13 — **including VD-C Android PWA install validation unless demonstrably satisfied**. Its
validation debt may run in parallel with 4.4, 4.3.9-L, 4.5-I and 4.3.8 (owner-approved 2026-09-02);
that parallelism neither closes nor weakens the phase.
**4.3.7 is CLOSED (2026-08-31)** — A–G all delivered, with 4.3.7A carrying an owner-ratified
deferral of three inputs that have no consumer. Three items are carried past closure as debt,
tracked in `docs/ROADMAP.md` §10.11: iOS standalone-PWA OAuth unverified, real media-query
validation at 320/390/430 unverified (viewport tool pinned at 1440px), and Google signup
attribution imprecision (analytics precision debt only). Onboarding now runs before account
creation: an anonymous `sessionStorage` draft
(`onboarding-draft.js`, raw answers only, never a second source of truth) is claimed into the
profile by a strictly ordered, fail-stop sequence — fields, then the completion flag, then a
read-back, and only then is the draft cleared. A completed profile is never merged into,
enforced in two independent places. Funnel telemetry (`analytics-core.js` +
`public.funnel_events`, Phase 4.3.7G) is append-only, write-only from any browser, carries **no
user id and no profile data**, and emits **nothing** for an already-onboarded user. 4.3.8, 4.3.9, 4.4
and 4.5 are NOT STARTED.

**Locked commercial critical path (reordered 2026-09-02, owner-approved):**
`4.4 (Coach v1, read-only) → 4.5-I (pre-activation build & certification, flags OFF) →
4.3.8 (first-run) → 4.5-A (paid-only activation)`,
then `4.6 → 4.7 → 4.8 → 4.9 → 4.3.9-X → 5.0 → 5.1`.

Running in **parallel and gated**: **4.3.9-L Recommendation Catalog Coverage** and **validation-debt
closure VD-A…VD-F**. **Phase numbers are stable identities — execution order lives in roadmap §13**,
so a number is a name, not a position. Binding gates G1–G6 are in roadmap §4, validation gates in
§10.13, and the reasons 4.3.8 moved are in `docs/ROADMAP-HISTORY.md` (2026-09-02). **Read those
before planning any phase; do not re-derive the order from this file.**

The shared-intelligence sequencing principle still holds and is why the roadmap is ordered as it is:

> shared intelligence → ranking → confidence → memory → portions → meal reasoning →
> benchmarks/polish → app-shell stability → training content → personalization → education →
> coaching → monetization → AI actions → expansion.

**Voice Logging, Photo Logging, and AI Coach are not isolated systems.** Each consumes the shared
food-resolution core and the intelligence layers built before it. A new input surface should add
almost no new intelligence — only a new way into the existing engine.

### Historical note — retired numbering

The 4.2.x → 5.0 sequence that previously lived in this section (`4.3 Voice Logging`,
`4.4 Read-Only AI Coach`, `4.5 Action Tools`, `4.6 Meal Recommendations`, `4.7 Preference Learning`,
`4.8 Notifications`, `4.9 Photo Logging`, `4.9.5 Knowledge Graph`, `5.0 Full Adaptive AI Coach`) is
**retired**. Those numbers now mean different things. Every commitment it contained was carried into
`docs/ROADMAP.md`:

| Retired number | Now lives at |
|---|---|
| 4.3 Voice Logging | 5.4.7 Voice Food Logging (surface) · 7.0 Voice Coach |
| 4.4 Read-Only AI Coach | **4.4** Personal AI Coach v1 — Read-Only |
| 4.5 AI Coach Action Tools | **4.7** AI Coach Action Tools |
| 4.6 Macro-Aware Meal Recommendations | 5.4.10 |
| 4.7 Preference Learning | 5.5.10 Preference Learning (distinct from 4.9 UI personalization) |
| 4.8 Notifications & Proactive Coaching | **4.6** Notifications & Accountability (infra) · 5.5 (content/cadence) |
| 4.9 Photo Logging | 5.4.8 |
| 4.9.5 Personal Knowledge Graph | 5.5.9 (evolving 4.3.7F Personal Context Layer) |
| 5.0 Full Adaptive AI Coach | 5.5 Adaptive AI Coaching |

---

## 12. DEFERRED ROADMAP ITEMS

**Authoritative list: `docs/ROADMAP.md` §11 "Protected Future Commitments" and §10 "Known Technical
Debt & Preserved Deferrals."**

Protected items may move between phases with approval; they may **never** silently disappear. Removal
requires an explicit `CANCELLED — YYYY-MM-DD — reason` line in the roadmap.

Do not interrupt the current phase for deferred work. Record unrelated findings; do not implement them.

Representative examples (not the full list — read the roadmap):

- **Saved Meals 2.0** (roadmap 5.4.3): rename saved meals · edit saved-meal contents · add or remove
  foods · change serving sizes · improved organization. Gesture polish (swipe-to-delete and the shared
  swipe framework) is roadmap 5.0.
- **Exercise media** — photos, video, muscle diagrams (roadmap 5.1.6).
- **Progression extensions** — equipment-aware increments, warm-up support, per-set/pyramid logic
  (roadmap 5.1.3–5.1.5).
- **Nutrition open loops** — portion-correction persistence and gram-edit capture (5.4.13),
  meal-context confidence gating (5.4.14), ranking/presentation hardening (5.4.12).

---

## 13. BRAND & DESIGN SYSTEM (v1.0 — Source of Truth)

### Mission
Make professional fitness coaching accessible, affordable, and personalized through coaching, technology, and AI.

### Vision
All-in-one fitness OS — learn, train, track, eat, improve, communicate with AI and coaches, purchase programs, join community — without ever leaving the platform.

### Core Values
Consistency · Simplicity · Accountability · Discipline · Education · Long-Term Results

### Brand Personality
**BE:** Motivating, Professional, Supportive, Direct, Practical, Results-Oriented
**NEVER BE:** Judgmental, Aggressive, Bro-science based, Overly complicated, Corporate, Generic

### Brand Voice
Sounds like a knowledgeable personal trainer who genuinely wants the user to succeed.
- Clear · Confident · Encouraging · Practical · Honest
- ❌ "Optimize nutrient timing for maximal hypertrophic adaptation."
- ✅ "Hit your protein, train hard, and stay consistent."

### Brand Promise
Practical fitness solutions that help people achieve real, sustainable results through consistency, accountability, education, and intelligent coaching.

### Marketing Rules
**Focus on:** Results, Simplicity, Education, Sustainability
**Avoid:** Unrealistic promises, fear-based marketing, extreme transformations, clickbait

### Design Feel
Premium · Athletic · Clean · Masculine · Minimal · Motivating
**NOT:** Cheap · Cluttered · Cartoonish · Generic · Sci-fi · Neon

### Color Palette
| Token | Hex |
|---|---|
| Background | `#050505` |
| Surface | `#111111` |
| Card | `#181818` |
| Border | `#2A2A2A` |
| Primary Text | `#FFFFFF` |
| Secondary Text | `#B8B8B8` |
| Muted Text | `#777777` |
| Accent Red | `#B1121B` |
| Accent Red Hover | `#D11D27` |

### Typography
| Font | Usage |
|---|---|
| **Bebas Neue** | Hero headlines, section titles, program titles, big numbers, CTAs (20px+) |
| **Barlow** | Paragraphs, forms, body copy, small labels/eyebrows/section tags (under 14px use Barlow 700 uppercase + letter-spacing, not Bebas Neue) |

**Do NOT use Orbitron** — it reads sci-fi/gaming and contradicts the brand feel.

### Buttons
- **Primary:** Deep red background · white text · bold uppercase · slight hover effect
- **Secondary:** Transparent/dark surface · white text · gray border
- **CTA examples:** START NOW · VIEW PROGRAMS · LOG WORKOUT · UPDATE PROGRESS · ASK AI COACH

### Cards
- Dark surface · subtle border · 16–24px padding · 12–20px border radius · clear title · one main action

### Layout
- Big bold headings · strong spacing · clean cards · rounded corners · subtle borders · simple icons · clear CTAs
- **Avoid:** Too many colors · thin unreadable text · random fonts · inconsistent spacing · overloaded sections

### Mobile (Mobile-First)
- Large buttons · easy thumb navigation · minimal typing · quick logging · clear progress bars · sticky bottom navigation

### Logo
- White logo on dark background (preferred), file `logow.png`.
- Never stretch, distort, recolor, or add effects.

### Visual Avoid List
- Neon colors · gaming aesthetics · excessive animations · cluttered layouts · cheap stock imagery
- Blue SaaS look · neon gaming look · overly playful design · too much animation

### UI copy / iconography
- **No emojis in product UI.** Rows are text-only; the vocabulary is Lucide icons + text badges. Emojis in Effi's mockups mean "friendly", not literal.

---

## 14. PRODUCT, BUSINESS, USER FLOW & PERMISSIONS (v1.0 — Source of Truth)

### User Flow
```
auth.html → onboarding.html (first-time users)
         → app.html (returning users)
```
- Google OAuth routes through `onboarding.html`.
- New users complete onboarding before accessing the dashboard.

### Onboarding — Data Collected
**Inputs:** Name · Age · Gender · Height · Weight · Body fat estimate · Goal · Activity level · Training experience · Days/week available · Gym access
**System Calculates:** Maintenance calories · Target calories · Protein target · Fat target · Carb target · Recommended training split · Daily habits

### Product Ladder
```
Free Guide → Program Purchase → Membership → Premium Coaching
```

### Free
| Product | Price | Purpose |
|---|---|---|
| Getting Started Guide | Free | Lead gen — fat loss fundamentals, nutrition basics, training basics, habit recs |

### Digital Programs (One-Time Purchase)
| Product | Slug | Price | Target | Status |
|---|---|---|---|---|
| 90-Day Fat Loss Blueprint | `fat_loss_blueprint` | $49 | Beginner–intermediate fat loss | `Live` (`program-fat-loss.html`) |
| Muscle Gain Program | `muscle_gain` | $59 | Users prioritizing muscle growth | `Live` (`program-muscle-gain.html`) |
| Glute Builder Program | `glute_builder` | $39 | Lower body / glute development | `Live` (`program-glute-builder.html`) |
| Home Strength Program | TBD | TBD | Bodyweight + dumbbells | `Planned` |
| Full Gym Strength Program | TBD | TBD | Full gym equipment | `Planned` |

### Membership
| Product | Slug | Price | Includes |
|---|---|---|---|
| Muscle Motivation Membership | `ai_membership` | $29/mo | Workout tracking, nutrition tracking, weight tracking, habit tracking, progress analytics, program library access, AI coach access |

### Premium Coaching (`Planned`)
- Price TBD. Includes: personalized programming, direct coach access, accountability, progress reviews, nutrition guidance.

### Business Model
Free Lead Gen → Digital Programs (one-time) → Membership (recurring) → Premium Coaching (high-ticket) → Merch (future).

### Target Customer
- **Primary:** Ages 18–55 · Goals: fat loss, muscle gain, body recomposition · Challenges: consistency, accountability, nutrition confusion, structure, time.
- **Secondary:** Seeking online coaching, home workout plans, personalized AI fitness support.

### Permissions
| User Type | Access |
|---|---|
| Free user | Calculator, limited dashboard, free guide |
| Program buyer | Purchased programs only |
| Member | Full tracking, AI Coach, program library |
| Premium coaching client | Full access + coach review + personalized programming |
| Admin | Full platform control |

---

## 15. IMPLEMENTED FEATURE STATUS (supersedes the old MVP build order)

The original "Phase 1 MVP" build order (Auth → Onboarding → Dashboard → Programs → Stripe → Weight →
Workout → AI Coach → Nutrition → Admin) is **historical**, not the current sequence. Current state:

- **`Live`:** Auth (login/signup/logout/reset, Google OAuth), onboarding + macro calculation, dashboard (`app.html`), calorie/macro calculator (`calculator.html`), program library + purchase pages, Stripe one-time purchases + subscriptions + customer portal, weight logging + trend (`weight.js`), workout logging + history + progressive overload (`workout*.html`, `progression.js`), nutrition tracking with USDA food search/barcode/saved meals (`nutrition.html`, `nutrition.js`, `food-core.js`), **AI natural-language text food logging** (`/api/ai-food-parse` → shared core → USDA → user confirmation), the **installable PWA** with a privacy-safe service worker and user-controlled updates (Phases 4.3.1–4.3.3: `manifest.webmanifest`, `sw*.js`, `pwa-install*.js`), and **Dashboard 2.0 + the app-shell bottom navigation** (Phase 4.3.4: `app-nav.js`, `app-shell.css`, `dashboard-model.js`, `program-state.js`, `profile.html`).
- **`Planned` / in progress:** the full AI Coach chat, voice logging, photo logging, habit tracking expansion, and every phase from 4.3.5 onward. Sequencing lives in `docs/ROADMAP.md`.

**Note on "voice" vs "text":** the current AI food-logging feature is **text** natural-language
logging (AI Quick Log). Voice food logging is `Planned` (roadmap **5.4.7**) and will consume the same
shared core; a conversational voice Coach is roadmap **7.0**. Older docs that described "voice" as
live were conflating voice with text, and older numbering that called voice logging "Phase 4.3" is
retired — 4.3.x is the PWA/app-shell track.

---

## 16. AI COACH GUIDANCE (v1.0 — Source of Truth)

### Role
Muscle Motivation AI Coach — help users lose fat, build muscle, improve health, stay consistent, maintain long-term results. **Not a doctor.** Refer medical concerns, injuries, medications, eating disorders, chest pain, fainting, or serious symptoms to qualified professionals.

### Personality
**Be:** Motivating · Direct · Supportive · Practical · Honest · Results-oriented · Simple · Human
**Never be:** Overly soft · Overly complicated · Judgmental · Robotic · Extreme · Unsafe

### Core Principles
1. Consistency beats perfection
2. Sustainable fat loss > crash dieting
3. Progressive overload drives muscle gain
4. Protein, calories, steps, sleep, training consistency matter most
5. Simple plans win
6. Adjust based on data, not emotion
7. The user should always know the next action

### User Data to Use When Available
Age · Gender · Height · Weight · Body fat estimate · Goal · Training experience · Training days · Gym access · Calories · Macros · Workout history · Nutrition logs · Weight trend · Habit compliance

### Fat Loss Guidance
- Moderate calorie deficit + high protein + strength training + daily steps + weekly weight average.
- Adjust every 2–3 weeks based on trend. Never recommend extreme starvation diets.

### Muscle Gain Guidance
- Small calorie surplus + progressive overload + adequate protein + enough carbs to train hard.
- Track strength and body weight.

### Plateau Detection (weight hasn't moved 2–3 weeks)
**Check:** Calorie consistency · Weekend eating · Steps · Sleep · Training consistency · Food tracking accuracy
**Then suggest:** Increase steps · Slight calorie reduction · Improve tracking · Add structure
**Do not panic-adjust too soon.**

### Accountability Check-In Format
1. Review what happened · 2. Identify one win · 3. Identify one fix · 4. Give next action
- Use simple language: *"Here's the move today…"*

### Response Format
1. Direct answer · 2. Why it matters · 3. Exact next step

**Example:** *"Keep calories the same this week. Your weight only stalled for four days, which is normal. Hit your protein, get your steps, and compare your weekly average next Monday."*

### Hard Boundaries
- No medical diagnosis · No medication advice · No unsafe weight loss · No shame · No steroid advice · No guaranteed results · Never replace a human coach when premium coaching is needed.

---

## 17. NUTRITION SYSTEM (v1.0 — Source of Truth)

### Philosophy
Sustainability · Consistency · Adequate Protein · Calorie Control · Long-Term Adherence

### Protein Guidelines
| Goal | Target |
|---|---|
| Fat Loss | 0.8–1.0g per lb of **goal** body weight |
| Muscle Gain | 0.7–1.0g per lb of body weight |
| Maintenance | 0.7–1.0g per lb of body weight |

### Fat Loss Framework
Primary targets: Calorie deficit · High protein · Resistance training · Daily activity · Sleep quality.
Adjust only after reviewing: Body weight trend · Compliance · Step count · Training consistency.

### Muscle Gain Framework
Small calorie surplus · Progressive overload · High protein · Consistent training.

### Meal Formula
**Protein Source + Fruit/Vegetable + Carbohydrate Source + Healthy Fat**

### Food Categories
- **Proteins:** Chicken, turkey, lean beef, fish, eggs, Greek yogurt, cottage cheese, protein powder
- **Carbs:** Rice, potatoes, oats, bread, quinoa, pasta, fruit
- **Fats:** Nuts, nut butter, avocado, olive oil
- **Vegetables:** Broccoli, carrots, spinach, peppers, salad greens

### Restaurant Guidance
1. Protein first · 2. Vegetables second · 3. Smart carb choices · 4. Portion awareness

### Nutrition Data Rules (binding)
- **Nutrition values must come from verified food databases (USDA), never AI-generated.** LLMs supply the search query + quantity/unit/brand only.
- **All entries are confirmed by the user before saving.**
- **All logged foods contribute to daily cal/protein/carb/fat/micronutrient tracking.**
- **Food-logging surfaces (`Live` and `Planned`):**
  - **Text (AI Quick Log)** — `Live`. Natural-language text → `/api/ai-food-parse` → shared core → USDA resolution → user confirmation.
  - **Manual search / barcode / saved meals / favorites / recents** — `Live`, all through `food-core.js`.
  - **Dictated text** — `Live`, with **no app-side voice code**: the OS keyboard microphone produces text that enters Quick Log like any typed description. **We own interpretation of the text; Apple and Android own transcription.** Do not build a microphone, audio recorder, browser Speech API integration, or server-side transcription pre-launch.
  - **Voice (dedicated in-app surface)** — `Planned` (roadmap 5.4.7, post-launch). Speech → shared core; user confirms. Distinct from roadmap 7.0 voice Coach.
  - **Photo** — `Planned` (roadmap 5.4.8). AI estimates cal/protein/carb/fat; **all estimates labeled as estimates and confirmed before saving.**

### USDA integration (`Live`)
`/api/usda-search`, `/api/usda-food`, `/api/usda-barcode` proxy USDA with the key held server-side.
USDA identity = source + `usda_fdc_id`; future features reuse it.

### Coaching Priorities (in order)
1. Calories · 2. Protein · 3. Consistency · 4. Food Quality · 5. Meal Timing
**The AI Coach always prioritizes adherence over perfection.**

---

## 18. WORKOUT SYSTEM (v1.0 — Source of Truth)

### Training Philosophy
Progressive Overload · Consistency · Simplicity · Sustainability · Evidence-Based

### Movement Categories
| Category | Examples |
|---|---|
| Squat | Back squat, front squat, goblet squat, split squat, leg press |
| Hinge | Romanian deadlift, conventional deadlift, trap bar deadlift, hip thrust |
| Horizontal Push | Bench press (flat/incline), DB press (flat/incline), push-up |
| Vertical Push | Overhead press, DB shoulder press, side lateral raises |
| Horizontal Pull | Barbell row, DB row, seated cable row, machine row |
| Vertical Pull | Pull-up, chin-up, lat pulldown |
| Core | Plank, crunches, lying leg raises, Russian twists, dead bug, hanging knee raise |
| Carry | Farmer carry, suitcase carry |
| Biceps | Curl variations |
| Triceps | Pushdown variations, overhead extension, dips |
| Calves | Standing calf raise, seated calf raise |

### Program Structure
| Level | Frequency | Focus |
|---|---|---|
| Beginner | 2–3 days/week | Movement mastery, consistency, technique |
| Intermediate | 3–5 days/week | Progressive overload, volume progression |
| Advanced | 4–6 days/week | Specialization, performance optimization |

### Progressive Overload Rules (implemented in `progression.js`)
- All sets/reps completed with good form → **increase weight next workout**.
- Target reps barely achieved → **repeat weight**.
- Reps missed → **repeat weight or reduce slightly**.

### Session Priority Order
1. Warm-up · 2. Major compound · 3. Secondary compound · 4. Upper-body push · 5. Upper-body pull · 6. Accessory work · 7. Core

### Exercise Database Fields (`Required Target Schema`)
Name · Category · Primary Muscles · Secondary Muscles · Equipment · Difficulty · Coaching Cues · Common Mistakes · Video Demo Link · Muscle Diagram.

*Metadata backfill shipped in Phase 4.2.1E and the catalog expanded to **141** rows in 4.2.1G — the
text/taxonomy fields are populated and currently unread by any UI. Surfacing them (muscles, movement
pattern, equipment, instructions, coaching cues, common mistakes) is roadmap **4.3.6H**; the media
fields (video demo, muscle diagram) are roadmap **5.1.6**.*

---

## 19. WEBSITE STRUCTURE

### Public Pages
- **Home** (`index.html`) — `Live`. Hero, Benefits, Calculator CTA, Testimonials, Programs, Membership, Contact
- **Programs / Store** (`store.html`) — `Live`. All products with details, purchase options, reviews
- **Calculator** (`calculator.html`) — `Live`. Free lead-gen; **never modify** (§3)
- **Free guide** (`get-fit-guide.html`) — `Live`. Free lead-gen
- **About** — **NOT BUILT.** Company story, mission, coach bio — roadmap 4.5.10
- **Pricing** — **NOT BUILT.** Plan comparison — roadmap 4.5.10, **required before the paid launch**
- **Contact** — **NOT BUILT.** Form, email, social links, WhatsApp — roadmap 4.5.10

Public lead-generation pages stay **free and ungated** after the paid-only launch; the paywall applies
to the authenticated application only (roadmap 4.5.9).

### Member Pages
- **auth.html** — Login / sign up
- **onboarding.html** — Goal questionnaire + macro setup (new users + Google OAuth)
- **app.html** — Member dashboard (returning users)
- **profile.html** — Account / profile (secondary destination reached from Home, not a primary tab)
- **nutrition.html** — Nutrition tracking + food logging
- **weight-history.html** — Weight trend + logging
- **workout.html / workout-history.html / workout-complete.html** — Workout logging + history
- **program-fat-loss.html / program-muscle-gain.html / program-glute-builder.html** — Program pages (`Live`)
- **reset-password.html** — Password reset

### Dashboard Displays

**Current (`Live`, Phase 4.3.4 — the approved default):** Today's Plan · weekly training progress ·
**Calories + Protein** nutrition snapshot · Coach Insight · progress snapshot (weight + trend) ·
Home / Train / Nutrition / Progress bottom navigation.

**Not on Home today:** Steps · Water · Sleep · Streak. Habit metrics are deferred to roadmap **5.2**
and remain secondary to the core "what do I do today?" experience. Carbs and Fat are optional
customization at roadmap **4.9.3**; Calories + Protein stays the default. Coach access arrives with
roadmap **4.4** (the `app-nav.js` registry already reserves the destination).

---

## 20. TARGET SCHEMA & LONG-TERM VISION

### Database Tables — `Required Target Schema`
The shape we build toward. Some tables are `Live`; others are aspirational and not yet deployed —
verify with `list_tables` before assuming a table exists.

```
users / profiles
onboarding_responses
workouts
workout_exercises
workout_sets
exercises
nutrition_logs
food_items
body_weight_logs
body_fat_logs
measurement_logs
progress_photos
habit_logs
programs
program_workouts
purchases
subscriptions
ai_chat_messages
admin_notes
ai_usage
```

- `ai_usage` (`Live` since Phase 4.2): per-user AI request tracking for rate/cost caps — `id, user_id, route, created_at`. RLS: users may SELECT their own rows; INSERT/UPDATE/DELETE happen only through the service role in Vercel functions.
- `food_corrections` (`Live` since Phase 4.2.4): per-user Correction Memory — identity columns store `nuFoodKey` strings (`incorrect_key`/`corrected_key`), plus `norm_query`, `intent_key`, minimal `*_meta` snapshots (name+brand only), `status` (active/superseded/deactivated), `reinforcement_count`, `schema_version`, `last_used_at`. Unique `(user_id, norm_query, corrected_key)` (repeats reinforce); indexes on `(user_id, norm_query)` and `(user_id, intent_key)` where `status='active'`. RLS `auth.uid() = user_id` for all four verbs (same client-write pattern as `user_food_favorites`); `on delete cascade` with the user for account-deletion compatibility. Written client-side; read at ranking time under the user's token.

### Long-Term Product Vision

**Muscle Motivation is not merely a workout or calorie tracker.** It is an intelligent fitness
operating system that helps users train, eat, track progress, build habits, receive guidance, and
improve over time.

Every interaction should make either the user or the system smarter. User actions improve future
coaching, and platform intelligence continuously reduces friction while increasing personalization.

Every major feature should either:

- help the user take a useful action,
- improve the system's understanding of the user,
- improve the accuracy of future guidance, or
- reduce friction in achieving sustainable fitness results.

The long-term AI coach should be able to **learn, reason, remember, plan, adapt, explain, and act
safely** using verified user data and shared platform intelligence.

**North Star:** *Does this make Muscle Motivation feel more like a real coach and less like an app?*
If yes, build it. If not, rethink the approach.

**Success Metric:** *"Does this help users achieve better fitness results more easily?"* If no — don't build it.


## 21. BASH & PERMISSION DISCIPLINE

For read-only audits and verification:

- Prefer simple, individual Bash commands over large compound shell scripts.
- Prefer already-approved read-only commands such as:
  - `git status`
  - `git diff`
  - `git log`
  - `git show`
  - `git branch`
  - `git merge-base`
  - `git rev-parse`
  - `git rev-list`
  - `grep`
  - `ls`
  - `curl`
  - MCP read-only tools
- Avoid nested quoting, multiline inline `python3 -c`, loops, brace-heavy commands, and complex command substitutions when a simpler equivalent exists.
- Do not request broad permanent allow rules for interpreters such as `python3 -c *`, `bash *`, or unrestricted shell execution merely to reduce prompts.
- **No confirmation needed** for the ship workflow (§8.1): creating branches, committing, pushing a
  feature branch, opening or updating a PR, and commenting on a PR.
- Keep consequential actions gated behind explicit confirmation:
  - merge
  - deploy, promote, or roll back
  - database writes or migrations
  - env vars or deployment config
  - package installs
  - deletes (files, branches, data)
  - force-pushes (never to `main`)
  - Stripe writes

**Goal:** Minimize unnecessary permission prompts without weakening safety.

---

*End of AGENTS.md — All sections are source of truth. Do not override without explicit instruction from Effi.*
