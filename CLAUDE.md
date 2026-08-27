# MUSCLE MOTIVATION — Claude Reference File
# Version 2.0 | Source of Truth for All Development

This file is read automatically by Claude Code at the start of every terminal session.
All guidelines here are binding. Do not deviate without explicit instruction from Effi.

This document is the permanent operating manual for every future Claude Code session. It is
optimized for long-term autonomous development, architectural consistency, and minimal
unnecessary interruptions. When deciding whether a rule belongs here, ask: *"Will this improve
Claude's engineering decisions over the next several hundred development sessions?"* If yes,
include it. If no, leave it out.

**Status labels used throughout this file:**
- `Live` — implemented and in production.
- `Planned` — on the approved roadmap, not yet built.
- `Approved Roadmap` — sequenced and committed, details may still evolve.
- `Required Target Schema` — the shape we are building toward; not all of it is deployed yet.

---

## 1. DOCUMENT AUTHORITY & SCOPE

- This file overrides default Claude behavior and is binding for all work in this repository.
- Every section is source of truth. Do not override any section without explicit instruction from Effi.
- Where this file and a linked design doc (`docs/`) disagree, the more specific and more recent
  document wins for that feature — but flag the conflict rather than silently choosing.
- **`docs/ROADMAP.md` is the single authority for roadmap numbering, sequencing, scope, and protected
  deferred commitments** (see §11). It overrides this file and every other document on those four things.
- Companion design docs are authoritative for their domains:
  - `docs/ROADMAP.md` — the canonical product roadmap; `docs/ROADMAP-HISTORY.md` — append-only phase closures.
  - `docs/ai-master-blueprint.md` — AI vision and engineering principles. **Superseded for roadmap numbering.**
  - `docs/food-resolution-core-design.md` — shared food-resolution core design (Phase 4.2.1).
  - `docs/exercise-intelligence-roadmap.md` (**superseded for roadmap numbering**) + `docs/exercise-intelligence-architecture.md` — Phase 4.2.1E plan; `docs/exercise-intelligence-foundation.md` — the shipped `exercise-core.js` foundation reference.
  - `docs/pwa-foundation.md` — PWA install + service-worker design record. **Superseded for roadmap numbering.**
  - `docs/progression-spec.md` — progressive-overload logic.

---

## 2. CLAUDE CODE ROLE

Claude Code acts as the **lead software engineer** for this repository. That means:

- **Read relevant files before proposing or implementing changes.** Never suggest a fix for code you haven't read.
- **Inspect existing abstractions before creating new ones.** The shared core (`food-core.js`), metrics (`metrics.js`), snapshot (`snapshot.js`), progression (`progression.js`), and weight (`weight.js`) modules already exist — reuse them.
- **Reuse existing utilities, contracts, tests, and patterns** whenever possible.
- **Make routine engineering decisions independently whenever sufficient information exists in the repository, roadmap, or CLAUDE.md.** When the task and these sources provide enough information, act — do not ask for confirmation on obvious calls.
- **Ask only when a decision is genuinely ambiguous, destructive, externally consequential, or requires product approval** (see §3 safety rules).
- **Never expand scope merely because another improvement is nearby.** Record unrelated findings for later; do not implement them in an unrelated change.
- **Protect architecture even when a shortcut would be faster.**
- **Continuously think several phases ahead.** Prefer solutions that reduce future implementation effort across the roadmap, not merely the current task.
- **Explain every modified file** — what changed and why.
- **Stop before committing or pushing** unless explicitly instructed otherwise.

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
- **Always show diffs before committing** destructive or wide-reaching changes.
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

## 8. DEFINITION OF DONE & CHECKPOINT REPORT

### Definition of Done

A task or phase is complete only when all applicable requirements are satisfied:

- Intended scope is fully implemented.
- Existing behavior is preserved unless a change was approved.
- Relevant tests are added or updated.
- The complete test suite passes (`npm test`).
- The full CI gate is green locally (`npm run verify`) — the same sequence the **Continuous Evaluation** workflow (`verify` check) runs; baselines are never updated to force it green (governance: `nutrition-evaluation/README.md`).
- No regressions are found.
- New shared logic is actually consumed where intended.
- Dead or duplicate code is removed only when safe.
- Documentation is updated when architecture or contracts change.
- **If the work closes a phase or materially changes roadmap scope, `docs/ROADMAP.md` and
  `docs/ROADMAP-HISTORY.md` are updated in the same roadmap/closure change.**
- Working tree contains only intended changes.
- Every changed file is explained.
- Unrelated findings are documented but not implemented.
- Claude stops before commit or push unless explicitly instructed otherwise.
- A checkpoint report is provided.

### Checkpoint Report Format

At the end of implementation tasks, provide:

1. Executive summary
2. Files modified and why
3. Architecture rationale
4. Behavioral-parity assessment
5. Tests added or changed
6. Complete test-suite result
7. Working-tree status
8. Unrelated findings not implemented
9. Risks or follow-up items
10. Explicit statement that no push was performed

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
- Test files: `ai-food-parse.test.js`, `usda-search.test.js`, `nutrition-resolve.test.js`, `food-ranking.test.js`, `food-memory.test.js`, `food-meal.test.js`, `food-portion.test.js`, `food-display.test.js`, `nutrition-search-cache.test.js`, `progression.test.js`, `exercise-core.test.js`, `exercise-search.test.js`, `exercise-custom.test.js`, `exercise-filters.test.js`, `exercise-log.test.js`, and the Phase 4.2.9 eval tests `nutrition-eval-schema.test.js`, `nutrition-eval-scoring.test.js`, `nutrition-eval-report.test.js`, plus the Phase 4.2.11 `nutrition-eval-gate.test.js`.
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
- Push via SSH: plain `git push origin main` works (no token needed). The CLAUDE.md token-in-URL note in older docs is stale.

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

### Shared Food-Resolution Core — `food-core.js` (`Live`, Phase 4.2.1)

`food-core.js` is the pure, DOM-free, fetch-free food-resolution intelligence shared by every
logging surface: manual search, AI text logging, barcode, saved meals, favorites/recents — and every
future one (voice, photo, AI Coach). It runs in two runtimes:

- **Browser** — loaded via `<script src="food-core.js">` **before** `nutrition.js` on `nutrition.html` and `app.html`; defines the globals `nutrition.js` uses.
- **Node** — guarded `module.exports` (same pattern as `snapshot.js` / `weight.js`) so server routes, tests, and benchmarks `require()` the exact production logic.

**Shared contracts (do not reshape without approval):**
- `ResolveRequest` — `{ text, query, brand, quantity, unit, grams }` (the `/api/ai-food-parse` item schema).
- `Candidate` — the trimmed USDA food returned by `/api/usda-search` + `/api/usda-barcode`.
- `NormalizedFood` — `nuNormalizeUsdaFood` output (per-serving macros + identity + `is_liquid`/`has_serving` flags + raw).
- `Portion` — `{ label, gramWeight, amount }` (trimmed `/api/usda-food`).

**Rule:** no feature should contain its own food logic. New food behavior goes into `food-core.js`,
is covered by `nutrition-resolve.test.js` and the benchmark corpus, and is consumed by every surface.

### Shared Food-Ranking Core — `food-ranking.js` (`Live`, Phase 4.2.2)

The pure candidate-reranking intelligence behind every food search — extracted from
`api/usda-search.js` in Phase 4.2.2. One ranking brain, one source of truth:

- **The proxy (`/api/usda-search`) remains the authoritative ranking boundary** — it fetches
  USDA pools and invokes `rankFoodCandidates(query, candidates, options)`; every surface that
  searches for candidates (manual search, AI Quick Log, the barcode scanner's
  "search manually instead" fallback, future voice/photo/coach) consumes the already-ordered
  candidate contract. A direct barcode HIT is one exact product and saved-meal REPLAY uses
  stored items — neither ranks, by design. **No surface reranks on its own**, and
  `nuCreateResolver` deliberately trusts `foods[0]`/`foods.slice(0, n)` order.
- Pure by contract: no network, no auth, no env — tests (`food-ranking.test.js`) and
  benchmarks run the exact production ranking offline.
- All score contributions are named weights in `RANK_WEIGHTS`; ranking behavior is tuned by
  editing that table and the config term lists (brands, categories, food intents), not code.
- **Extension seam:** `options.signals` — pure `(candidate, features, ctx) → number` passes.
  Phases 4.2.3+ (confidence, correction memory, portion compatibility, meal context,
  preferences) plug in there without touching candidate acquisition or creating a second
  ranking engine.
- **Tiered identity/intent/quality signals (`Live`, Phase 4.2.7).** Six named passes enforce
  an explicit priority model — **primary identity > explicit intent > candidate quality** — so a
  weak signal can never overpower identity: `speciesMismatch` (chicken never resolves to turkey),
  `familyIdentityMismatch` (a "mayo" query rejects a Flor-de-Mayo *bean* by food-family, independent
  of the `mayo→mayonnaise` query rewrite), `productFormMismatch` (a form mismatch also **gates**
  the brand-intent boost — a Fairlife *bar* query never lands on Fairlife *milk*),
  `missingRequestedBrand` (asymmetric: an explicit brand prefers its candidate; silent when no
  brand is typed), `unrequestedSpecialtySubtype` (generic "rice" demotes glutinous/sushi/etc.,
  intent-aware), and a tie-breaker-band `servingQuality` (usable gram/ml + household measure; can
  never flip identity). Config lives in named tables (`ANIMAL_SPECIES`, `PRODUCT_FORMS`,
  `IDENTITY_EXPECTED_FAMILY`, `CANDIDATE_FAMILY`, `SPECIALTY_SUBTYPES`). Each kept candidate is
  stamped with two inspectable fields on the shared Candidate contract: `servingQuality`
  (`'usable'|'household'|'weak'|'generic'`) and `mismatch` (a hard species/form/identity conflict);
  `explainCandidate(query, candidate)` returns the full per-pass breakdown for tests/diagnostics.
  The `mismatch` flag feeds a high-precision **confidence guard** in `food-core.js`
  (`nuAssessConfidence`): a top candidate that hard-mismatches an explicitly-requested
  form/species/identity is never a confident auto-resolve (choose_candidate if alternatives exist,
  else `unresolved`) — so a query with no valid candidate is never confidently mis-logged.
- **Path C — canonical-default-aware ambiguity + explicit-family consistency
  (`Live`, Phase 4.2.10b).** `rankFoodCandidates` stamps a third inspectable
  Candidate field, **`identityScore`** — the sum of the SEMANTIC identity/default
  signals (canonical-generic + preferred/base descriptors + food-intent − specialty
  demotion), NOT raw phrase/token match quality. `nuAssessConfidence` reads it under
  the pure, deterministic `NU_CONFIDENCE.materialAmbiguity` policy to escalate a
  generic auto-resolve to a chooser ONLY when a *close, materially-different* rival
  exists AND the top has no defensible-default reason (`explicit_query_modifier` /
  `immaterial_nearest` / `stronger_identity`, via `nuDefaultEvidence`) — so broad
  ties (soup, protein) clarify while preferred/canonical defaults and explicit
  subtypes (chicken→breast, apple→raw, tomato soup) stay auto. The same pass drops
  any `mismatch`-flagged candidate from the clarification OPTIONS, so an explicit
  product-family query (`protein powder`) never offers an incompatible family. A
  caller that bypasses `rankFoodCandidates` receives no `identityScore` and
  intentionally falls back to legacy (pre-4.2.10b) confidence behavior; any future
  ranking adapter MUST preserve `identityScore` and its meaning, and
  `materialAmbiguity` must remain deterministic and pure.

### Shared Correction Memory Core — `food-memory.js` (`Live`, Phase 4.2.4)

Pure, DOM-free, fetch-free intelligence (browser + Node, same guarded-exports
pattern) that lets food resolution LEARN from explicit user corrections. It
reuses `food-core.js` (`nuFoodKey`, `NU_PREP_STATE`, `nuAiNameSig`) and
`food-ranking.js` (`nText`/`tokenize`/`stem`/`queryBrandEntries`) — no duplicated
normalization or identity. Browser load order on `nutrition.html`:
`food-core.js` → `food-ranking.js` → `food-memory.js` → `nutrition.js`.

- **Server-authoritative, one seam.** `rankFoodCandidates` stays the ONLY ranking
  authority and runs server-side in `/api/usda-search`; the resolver never
  reranks (still trusts `foods[0]`). Correction memory reaches ranking ONLY
  through the `options.signals` seam. Two sources feed the SAME
  `nmCorrectionSignal`: **persistent** (the user's `public.food_corrections`
  rows, loaded under their RLS token, indexed by `norm_query` + anchored
  `intent_key`, bounded) and **session** (a request-scoped
  `X-Correction-Context` header — UNTRUSTED preference evidence: parsed,
  size/shape/identity/schema-validated, never written to the DB from the search
  route). Persistent ∪ session are deduped so a correction is never
  double-counted. Every failure path degrades to normal ranking.
- **Capture:** only an explicit chooser correction — `aiChoose(i, ci)` with
  `ci > 0` (the user picked a candidate OTHER than the implicit top). Confirmations,
  clarification answers, quantity/serving edits, and cancels are NOT corrections.
- **Matching tiers (conservative):** `exact` (canonical normalized query) >
  `normalized` (same brand+base+product, compatible prep) > `intent` (an anchored
  memory generalizing to a strictly more specific query). Brand/prep/product/base
  conflicts HARD-block generalization. Boosts are bounded (`NU_CORRECTION`,
  capped below the ranking safety floors) and can never fabricate a candidate or
  bypass eligibility/verification/dedupe.
- Covered by `food-memory.test.js`, server-path cases in `usda-search.test.js`,
  a resolver-no-rerank pin in `nutrition-resolve.test.js`, and `correction-memory`
  benchmark cases.

### Shared Meal-Reasoning Core — `food-meal.js` (`Live`, Phase 4.2.6)

Pure, DOM-free, fetch-free intelligence (browser + Node, same guarded-exports
pattern) that reasons about a GROUP of parsed foods as one meal to improve each
food's resolution. Reuses `food-ranking.js` (`nText`/`tokenize`/`stem`) and
`food-core.js` (`NU_PREP_STATE`) — no duplicated normalization. Browser load
order on `nutrition.html`: `food-core.js` → `food-ranking.js` → `food-memory.js`
→ `food-portion.js` → `food-meal.js` → `nutrition.js`. (`app.html` doesn't run
AI Quick Log; every `nutrition.js` meal call is `typeof`-guarded, so it needs no
new script.)

- **Server-authoritative, one seam.** `rankFoodCandidates` stays the ONLY ranking
  authority and runs server-side in `/api/usda-search`; the resolver never
  reranks. Meal reasoning reaches ranking ONLY through the `options.signals` seam,
  exactly like Correction Memory, and both signals coexist. `nutrition.js`
  computes ONE immutable meal context per parsed meal (`nuBuildMealContext`, only
  for a ≥2-item meal), hands each item its stable `mealIndex` + a minimal,
  CANDIDATE-INDEPENDENT projection (`nuMealItemProjection`), which the browser
  serializes into an `X-Meal-Context` header. usda-search validates it as
  UNTRUSTED evidence (`nuParseMealContext`: version/enum/array/size bounds,
  fail-open) → `nuMealSignal`. It carries no candidate ids/rankings/confidence, so
  it can only reorder the normally-retrieved pool — never fabricate a candidate.
- **Bounded tie-breakers.** Every contribution is a named `MEAL_WEIGHTS` entry
  (beverage ±240/-320, cooked ±160/-240, animal-mismatch -300), sized below the
  direct query weights (nameIsQuery 2000 …) and clamped to ±`totalCap` (500), so
  meal context breaks close ties without overriding a decisive match or the
  ranking safety floors.
- **Signals (conservative, evidence-based):** beverage-vs-solid consistency;
  shared cooked-preparation expectation for a raw/cooked commodity (item-local
  prep always overrides; a raw item is never forced cooked); animal-subtype
  consistency. Candidate classification prefers structured USDA `foodCategory`,
  name-based only as a documented fallback.
- **Confidence + provenance.** Meal evidence is ALWAYS computed and recorded (on
  the confidence verdict's `meal` field and the resolved item's `meal`
  provenance); DISPOSITION changes are gated behind `NU_CONFIDENCE.mealContext`
  (default OFF), so meal context never silently increases clarifications. Foods
  stay separate entries — this core never merges or splits.
- Covered by `food-meal.test.js` (incl. validation-rejection + ablation cases),
  server-path cases in `usda-search.test.js`, resolver integration in
  `nutrition-resolve.test.js`, and `meal-reasoning` benchmark cases.

### Shared Custom-Exercise Lifecycle Core — `exercise-custom.js` (`Live`, Phase 4.2.1H)

The lifecycle sibling of `exercise-core.js`: one pure, DOM-free, fetch-free,
DB-free layer owning the rules for **user-created custom exercises**
(`user_exercises`) — create, edit, archive, restore, permanent-delete. Browser
global `ExerciseCustom` + guarded `module.exports`; loaded on `workout.html`
AFTER `exercise-core.js` (reuses its `normalizeExerciseName`, so custom identity
and catalog identity never drift).

- **Customs live OUTSIDE the resolver.** They carry no taxonomy metadata and are
  never in the `createExerciseIndex` catalog, so every lifecycle decision runs
  through this metadata-free core. `workout_exercises.exercise_id` FKs to
  canonical `exercises.id` ONLY (nullable); a custom persists purely as an
  `exercise_name` **text snapshot** (`exercise_id = NULL`). Nothing
  (history/PRs/progression/templates) foreign-keys `user_exercises`, so editing/
  archiving/deleting a custom can never damage logged data. **History shows the
  snapshot name, not the live custom name — by design; editing never rewrites
  history.**
- **DB (Phase 4.2.1H):** `user_exercises` gained `normalized_name` (generated,
  mirrors `normalizeExerciseName`), `archived_at` (soft-delete; NULL = active),
  `updated_at`, and a partial unique index `(user_id, normalized_name) WHERE
  archived_at IS NULL` (active-only uniqueness; archived rows excluded so
  same-name restore/recreate works — the old plain `UNIQUE(user_id, lower(name))`
  was dropped for this reason). RLS unchanged: `user_exercises` ALL policy
  `auth.uid()=user_id` owner-scopes all four verbs; `exercises` stays SELECT-only
  (canonical read-only to clients).
- **Decision surface:** `buildLifecycleContext` → `classifyCreateIntent`
  (deterministic precedence invalid → **use-canonical** → **reuse-active** →
  **restore-archived** → **create**, so a canonical name never spawns a shadow
  custom, an active dup is reused, and an archived match is restored not
  duplicated), `classifyEditIntent` (blank/canonical-collision/active-collision/
  archived-collision rejections; noop vs rename; id preserved), and
  `canPermanentlyDelete(referenceCount)` (delete allowed only when unreferenced;
  otherwise archive-only). A foreign user's custom is invisible by construction
  (RLS), so matching one has no effect. Covered by `exercise-custom.test.js`.
- **UI:** a "My Exercises" section on `workout.html` (edit/archive/restore, and
  permanent-delete only for unreferenced archived customs) using the app's modal
  pattern — never native `confirm()`.

### Shared Exercise-Discovery Filter Core — `exercise-filters.js` (`Live`, Phase 4.2.1I)

The discovery sibling of `exercise-core.js` (identity/resolution) and
`exercise-custom.js` (lifecycle): one pure, DOM-free, fetch-free, DB-free layer
owning how the picker NARROWS exercises by training **split**, **movement
pattern**, and **equipment**, and how those filters COMPOSE with the shared
search/ranking. Browser global `ExerciseFilters` + guarded `module.exports`;
loaded on `workout.html` AFTER `exercise-core.js` (reuses its `normalizeEquipment`
+ `normalizeExerciseName`, so equipment/identity classification never drifts).

- **Filters CONSTRAIN eligibility; ranking is unchanged.** `runDiscovery` is the
  ONE composition the picker UI, Node tests, and benchmarks share: it runs
  `index.search()` (exercise-core ranking — exact > alias > normalized > variant,
  hard-modifier/unilateral/Smith guards intact) THEN filters the results to the
  eligible set (order preserved). A highly-ranked non-matching exercise can never
  bypass an active filter; no auto-selection (the user still taps a row).
- **Membership is DERIVED from catalog metadata, never scattered name checks.**
  All maps live in this module. **Split rules (final):** push/vertical-push →
  Push+Upper; horizontal/vertical-pull → Pull+Upper; squat/hinge/lunge →
  Legs+Lower; core/rotation → Core; carry/gait → Full Body; isolation → by
  primary-muscle region (chest/triceps/shoulders → Push+Upper; back/biceps/rear-
  delts → Pull+Upper; quads/hams/glutes/calves → Legs+Lower; abs → Core). Every
  one of the 141 canonicals gets ≥1 and ≤2 splits (verified in tests).
  **Movement filters (final):** Squat, Hinge, Horizontal/Vertical Push,
  Horizontal/Vertical Pull, Lunge, Carry, Isolation, Core (rotation folds into
  Core; `gait`/treadmill has no movement chip by design). **Equipment filters
  (final):** Barbell, Dumbbell, Cable, Machine, Bodyweight, Smith Machine,
  Kettlebell, Resistance Band (exercise-core's normalized vocab; Smith ≠ Machine).
  Within a category the selected keys OR; across categories they AND.
- **Customs stay outside metadata filters.** A user custom carries no taxonomy,
  so it is searchable by name when NO filter is active and invisible to any active
  metadata filter — never assigned a fabricated split/movement/equipment. This
  never weakens the Phase 4.2.1H lifecycle/ownership rules (the caller passes only
  the user's ACTIVE customs; archived/foreign customs are simply absent).
- **Filter state is session-scoped, never persisted** (no DB, per the phase
  scope): reset each time the picker opens, preserved while it stays open.
- **UI:** an inline collapsible filter panel beside the picker search (a "Filters"
  button with an active-count badge → chip groups + Reset all), plus a removable
  active-chip bar and a filters-aware empty state — using the app's design system,
  never native dialogs. Result rows wrap long names (no mobile overflow/clipping).
  Covered by `exercise-filters.test.js` and `discovery`-tagged
  `benchmarks/exercise-cases.jsonl` cases (collision assertions, not just presence).

### Shared Exercise-Logging Reliability Core — `exercise-log.js` (`Live`, Phase 4.2.1J)

The logging-reliability sibling of `exercise-core.js` (identity/resolution),
`exercise-custom.js` (lifecycle), and `exercise-filters.js` (discovery): one
pure, DOM-free, fetch-free, DB-free layer owning three reliability concerns for
the workout logger. Browser global `ExerciseLog` + guarded `module.exports`;
loaded on `workout.html` and `workout-history.html` AFTER `exercise-core.js`
(reuses its `normalizeExerciseName`, so logged identity never drifts).

- **ID-first logged identity.** `sameLoggedExercise(ref, row)` /
  `filterLoggedMatches` / `isComparableForProgression` decide which prior logged
  `workout_exercises` rows are the SAME exercise as the one being logged. A
  canonical exercise matches by stable `exercises.id` (so Smith-machine bench ≠
  barbell bench, pull-up ≠ assisted pull-up, seated ≠ lying leg curl, machine
  press ≠ free-weight bench — regardless of name similarity), plus legacy
  pre-4.2.1F NULL rows carrying its canonical name (a custom can never take a
  canonical name per 4.2.1H, so a name-equal NULL row with **no** custom id is a
  legacy canonical log — safe to fold). A custom/free-typed exercise matches by
  name and **never** inherits a canonical's history; two customs with different
  known ids stay distinct. `workout.html` `loadLoggedMatches(ex)` consumes this
  for `loadLastPerf`, `loadExerciseHistory`, and the live-PR baseline — the
  in-memory `ex` now carries `exercise_id` **and `customId`** (Phase 4.2.1K).
  Previous-performance/progression are therefore ID-first, not name-only.
- **Stable identity model + PR identity (`Live`, Phase 4.2.1K).** The two Phase-J
  gaps are closed. `workout_exercises` now persists `user_exercise_id` (a custom's
  stable `user_exercises.id`) alongside canonical `exercise_id` — mutually
  exclusive (DB CHECK), FK `ON DELETE SET NULL` so a custom's permanent delete or
  account deletion degrades a row to legacy rather than erasing history. A shared
  `identityType` / `identityKey` / `prIdentityColumns` / `prConflictTarget`
  classify a reference as `canonical` (exercise_id) > `custom` (user_exercise_id) >
  `legacy` (normalized name), and `personal_records` gained `exercise_id` +
  `user_exercise_id` with identity-aware uniqueness — `unique (user_id,
  exercise_id)` / `unique (user_id, user_exercise_id)` (NULLs distinct) + a partial
  `(user_id, exercise_name) WHERE both ids null` legacy guard — so a canonical and
  a same-name custom, two same-name customs, and rename/archive/restore/recreate
  all keep separate PRs, while a **recreated** same-name custom gets a NEW id.
  `detectAndRecordPRs` reads/writes by identity (canonical→`user_id,exercise_id`,
  custom→`user_id,user_exercise_id` upsert; legacy read-then-write by row id, never
  a new name-only row). Backfill was conservative and unambiguous only (81
  canonical + 99 custom of 189; the 8 canonical/custom name-collision rows + 1
  un-attributable stay legacy — never guessed). Same-user ownership of custom
  references is enforced server-side by BEFORE triggers on both tables (User A can
  never reference User B's custom). The `workout-complete.html` recap trend and
  `personal_records` are the only PR read/write surfaces; there is no global PR
  list. **Still name-only:** legacy pre-K `workout_exercises` custom rows keep
  matching by name (conservative fold) — never backfilled to avoid guessing.
- **Chronological previous-session selection.** `selectPreviousSessions(...)`
  excludes the current in-progress workout, incomplete (draft/abandoned)
  sessions, and future-dated rows, then orders deterministically (date desc →
  createdAt desc → id). DB queries order by `date, created_at` to match.
- **Set-value sanitization.** `sanitizeReps` / `sanitizeWeight` / `sanitizeSetField`
  guard the persistence boundary: blank stays blank, zero and decimals are
  preserved, but NaN/Infinity/negative/malformed never reach the DB. Consumed by
  `updateSet` and the history editor.
- **Duplicate-submit + completed-workout guards** (in `workout.html`, not this
  module): a per-action in-flight lock makes `selectExercise`/`addSet`/
  `removeExercise`/`finishWorkout` idempotent under rapid taps, and
  `finishWorkout` uses an optimistic `completed=false → true` transition so a
  second tab / re-tap never double-runs PR detection or progression.
- Covered by `exercise-log.test.js` and `logging-identity` / `logging-chrono`
  tagged `benchmarks/exercise-cases.jsonl` cases (real-catalog identity + literal
  custom refs), scored inline by `run-exercise.js`.

### Nutrition Evaluation Suite — `nutrition-evaluation/` (`Live`, Phase 4.2.9)

A broad, repeatable, **diagnostic** evaluation of the whole nutrition pipeline —
the report to run **before every nutrition release**. Full reference:
`nutrition-evaluation/README.md`; baseline summary: `nutrition-evaluation/BASELINE.md`.

- **Command:** `npm run eval:nutrition` (deterministic, offline; no network/DB/keys,
  no production writes, no test-account dependency). `--no-gate` / `--json` /
  `--update-baseline` / `--prod-changed`. Artifacts → `reports/nutrition-evaluation/`
  (git-ignored); durable record → `nutrition-evaluation/baseline.json`.
- **Measures production, never a re-implementation.** `engine.js` wires the exact
  pure seams (`food-core`/`food-ranking`/`food-memory`/`food-meal`/`food-portion`/
  `food-display`) the way the app does — `rankFoodCandidates` stays the sole
  ranking authority; the resolver still trusts `foods[0]`. Reuses
  `benchmarks/fixtures.js` pools verbatim (never edited) + `pools.js` extensions.
- **Ten categories** (parsing/retrieval/ranking/confidence/clarification/portion/
  meal/correction/display + a `regression` manifest pinning every 4.2.1–4.2.8 fix
  with `via`+`phase`). **Preferred vs acceptable** candidates are distinguished;
  **earliest-failure diagnostic staging** never cascades a retrieval miss into a
  ranking fault. Metrics: Top-1, acceptable-candidate, recall@1/3/5/10,
  clarification P/R, **false-confidence rate**, portion, meal case+item, parsing
  case+field, display. AI meal split/merge is out of scope (non-deterministic).
- **Guardrail (binding):** this suite is a **measurement instrument, not a target**.
  **Never change ranking/parsing/retrieval/confidence logic merely to make a case
  pass** — a lower honest baseline beats an artificially perfect one. Fixtures
  encode expected semantics; divergences are recorded (scored failure or
  `informational` triaged case) and deferred to a hardening phase. Release gate
  (default): fixture-validity + no-crash + no non-informational `regression`
  failure + no committed-metric regression >1.0 pct in its **direction** vs
  baseline. Newly-added non-regression failures are informational until reviewed.
  `baseline.json` is **never auto-overwritten** (`--update-baseline` only; never
  in CI). Covered by `nutrition-eval-{schema,scoring,report,gate}.test.js`.
- **Direction-aware gate (Phase 4.2.11):** `gate.js` declares each metric's
  direction — accuracy/recall/clarification/display/portion/meal/parsing are
  `higher_is_better` (drop = regression); **false-confidence is `lower_is_better`
  (rise = regression)**; an undeclared metric fails safe. Baseline **governance**
  (when `--update-baseline` is allowed, case add/remove, informational/known_fail,
  intentional decreases) and the **production-failure → `reg-*` case** playbook
  are authoritative in `nutrition-evaluation/README.md` — not restated here.
  Approved-milestone timeline: `nutrition-evaluation/HISTORY.md` (append-only,
  never written by CI).
- **Phase 4.2.9 baseline (SHA 47b9736):** 237 cases, overall 99.6% (228/229),
  false-confidence 5% (1/20). Documented open items → a confidence-hardening
  phase (bare "coffee" auto-resolves to "Coffee cake" — the sole false-confidence
  case) and a display over-simplification cleanup (folds in the deferred
  `Cinnamon Cinnamon Granola` de-dup). No production logic changed.

### Other shared modules (`Live`)

- `metrics.js`, `snapshot.js` — dashboard snapshot/metrics.
- `weight.js`, `weight-history.html` — weight tracking + trend.
- `progression.js` (spec: `docs/progression-spec.md`) — progressive-overload logic; `schedules.js`, `workout-history.js` — workout support. `analyze()` now accepts optional `equipment`/`mechanics` exercise metadata (Phase 4.2.1E seam), name-regex inference as fallback — exact parity when omitted.

### Shared Exercise-Intelligence Core — `exercise-core.js` (`Live`, Phase 4.2.1E)

The exercise-domain equivalent of `food-core.js`: one pure, DOM-free, fetch-free,
DB-free layer owning *what an exercise is* and *which exercise the user means*.
Browser global `ExerciseIntelligence` + guarded `module.exports` (same pattern as
`progression.js`). Full reference: `docs/exercise-intelligence-foundation.md`.

- **Catalog-injected, never catalog-owning.** Resolution runs over a catalog of
  `exercises`-row records passed IN (the DB stays the runtime source of truth);
  the module keys off the SAME stable `exercises.id`, so a `canonicalExerciseId`
  it returns equals the production id. The catalog was expanded from 57 to **141
  curated rows** in **Phase 4.2.1G** (Smith/machine/cable/dumbbell/bodyweight/band
  staples, unilateral variants, confirmed picker misses like front squat); id-set
  checksum `3f740fb4f3466d3e15aee5718f4a910e`. The benchmark fixture
  (`benchmarks/exercise-fixtures.js`) mirrors the DB id-for-id.
- **One shared taxonomy** (movement patterns, equipment, force/difficulty/
  tracking enums), **normalization** (`normalizeExerciseName`/
  `buildExerciseLookupKey`), **alias + variant resolution** with a HARD-modifier
  variant guard (incline never collapses to flat; a demanded hard variant the
  catalog lacks — e.g. `decline squat` — stays `unresolved`, never another squat;
  base-token superset keeps `single-arm cable row` off the bilateral row), a
  curated **family model** (base movement + intent, never muscle-only),
  a conservative directional **relationship graph** (equipment-substitution /
  variant / progression / regression / same-pattern-alternative; isolation gets
  no cross-family net), and deterministic **validation**.
- **Consumed today** by `progression.js` via `getProgressionMeta(ex)` (equipment/
  mechanics from metadata, not name regex) and, since **Phase 4.2.1F**, by the
  `workout.html` exercise picker via `index.search()` — the LIST-producing sibling
  of `resolve()` (deterministic tiered ranking: exact→alias→normalized→variant→
  related→prefix→partial; same normalization/alias/variant guard, no second
  resolver). The picker builds the index over the GLOBAL catalog only, so every
  result id is a real `exercises.id`; it stamps that id onto
  `workout_exercises.exercise_id` and always saves the canonical name (never alias/
  search text). Broad/ambiguous terms show a chooser and never auto-select; a
  demanded hard variant absent from the catalog stays `unresolved` (no false
  exact). Details in `docs/exercise-intelligence-foundation.md` §13. Catalog
  expansion (**Phase 4.2.1G**) shipped, and the PR/history `exercise_id` migration
  shipped as **Phase 4.2.1K** (dual canonical/custom identity; the residual
  legacy name-keyed rows are recorded in `docs/ROADMAP.md` §10.1).
  Covered by `exercise-core.test.js`, `exercise-search.test.js`, and
  the `benchmarks/exercise-cases.jsonl` corpus (incl. `picker`-tagged search cases
  and Phase 4.2.1G collision/negative-boundary cases).

---

## 11. CURRENT ROADMAP

**The canonical Muscle Motivation product roadmap is `docs/ROADMAP.md`.**

**Read it before planning or implementing roadmap work.**

- It is the **only** authoritative source for phase numbering, scope, and sequencing.
- Older roadmap and design documents (`docs/ai-master-blueprint.md`,
  `docs/exercise-intelligence-roadmap.md`, `docs/pwa-foundation.md`, and older Claude memory roadmap
  notes) are retained **only** for rationale and implementation detail where they conflict with
  `docs/ROADMAP.md`. Their phase numbering must not be used for planning.
- Completed phase history is recorded in `docs/ROADMAP-HISTORY.md` (append-only).
- **Do not reorder phases, renumber phases, remove protected commitments, create major new phases,
  change monetization timing, or change free/paid boundaries without Effi's explicit approval.**
  Placing a clearly fitting minor requirement into an existing phase, recording a discovered
  dependency, correcting a factual shipped/not-shipped status, and marking an approved exit criterion
  complete are permitted (roadmap §12.3).

**Current position:** phases 4.2, 4.3.1, 4.3.2, 4.3.3, and 4.3.4 are closed.
**Next phase: 4.3.5 — Mobile UX & App-Shell Hardening.**

Locked commercial critical path:
`4.3.5 → 4.3.6 → 4.3.7 → 4.3.8 → 4.4 (Coach v1, read-only) → 4.5 (paid-only launch)`,
then `4.6 Notifications → 4.7 Coach Action Tools → 4.8 Training Engine 2.0 → 4.9 Personalization →
5.0 Mobile Interaction Polish → 5.1 Smart Training 2.0`.

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
  - **Voice** — `Planned` (roadmap 5.4.7). Speech → shared core; user confirms.
  - **Photo** — `Planned` (Phase 4.9). AI estimates cal/protein/carb/fat; **all estimates labeled as estimates and confirmed before saving.**

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
- Keep consequential actions gated behind explicit confirmation:
  - commit
  - push
  - merge
  - deploy
  - database writes or migrations
  - package installs
  - deletes
  - force-pushes
  - Stripe writes

**Goal:** Minimize unnecessary permission prompts without weakening safety.

---

*End of CLAUDE.md — All sections are source of truth. Do not override without explicit instruction from Effi.*
