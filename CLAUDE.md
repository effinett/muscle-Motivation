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
- Companion design docs are authoritative for their domains:
  - `docs/ai-master-blueprint.md` — AI roadmap 4.2.x → 5.0 (source of truth for the roadmap).
  - `docs/food-resolution-core-design.md` — shared food-resolution core design (Phase 4.2.1).
  - `docs/exercise-intelligence-roadmap.md` + `docs/exercise-intelligence-architecture.md` — Phase 4.2.1E plan; `docs/exercise-intelligence-foundation.md` — the shipped `exercise-core.js` foundation reference.
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
rule of the entire roadmap (§11).

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
- No regressions are found.
- New shared logic is actually consumed where intended.
- Dead or duplicate code is removed only when safe.
- Documentation is updated when architecture or contracts change.
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
- `package.json`: `npm test` → `node --test`; `npm run bench` → `node benchmarks/run-resolve.js`; `npm run bench:exercise` → `node benchmarks/run-exercise.js`.
- Dependencies: `@anthropic-ai/sdk`, `stripe`. No build step.
- Test files: `ai-food-parse.test.js`, `usda-search.test.js`, `nutrition-resolve.test.js`, `food-ranking.test.js`, `food-memory.test.js`, `food-meal.test.js`, `food-portion.test.js`, `nutrition-search-cache.test.js`, `progression.test.js`, `exercise-core.test.js`, `exercise-search.test.js`, `exercise-custom.test.js`.
- Benchmark corpus: `benchmarks/resolve-cases.jsonl` + `benchmarks/fixtures.js`, run by `benchmarks/run-resolve.js` (two-tier runner, Phase 4.2.1d). Exercise resolution: `benchmarks/exercise-cases.jsonl` + `benchmarks/exercise-fixtures.js`, run by `benchmarks/run-exercise.js` (Phase 4.2.1E).

**Supabase notes:**
- Auth calls wrapped in `window.addEventListener('load', ...)`.
- DDL changes must go through `apply_migration` (tracked), not `execute_sql`.
- Verify schema via `pg_proc` and `pg_indexes` directly — Supabase advisor may return stale results.
- Before schema changes, run `list_tables`. When debugging, start with `get_logs` and `get_advisors`.

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
  expansion (**Phase 4.2.1G**) shipped; PR/history `exercise_id` migration
  (Phase 6) remains the next step — deliberately deferred (no historical rewrite
  in 4.2.1G). Covered by `exercise-core.test.js`, `exercise-search.test.js`, and
  the `benchmarks/exercise-cases.jsonl` corpus (incl. `picker`-tagged search cases
  and Phase 4.2.1G collision/negative-boundary cases).

---

## 11. CURRENT ROADMAP (Approved Roadmap)

The old broad MVP/version roadmap and MVP build order are **no longer the authoritative
implementation sequence** — those MVP capabilities are largely `Live` (see §15). The authoritative
sequence is the AI/intelligence architecture roadmap below, sourced from
`docs/ai-master-blueprint.md`.

**Sequencing logic (do not reorder without approval):**

> shared intelligence → ranking → confidence → memory → portions → meal reasoning →
> benchmarks/polish → new input surfaces → coaching → personalization → proactive systems →
> personal knowledge graph → full coach.

**Voice Logging, Photo Logging, and AI Coach are not isolated systems.** Each consumes the shared
food-resolution core and the intelligence layers built before it. A new input surface should add
almost no new intelligence — only a new way into the existing engine.

### Nutrition intelligence sequence

| Phase | Name | Purpose / dependency |
|---|---|---|
| 4.2.0 | Production Polish | Stabilize the foundation (bugs, regressions, UX/perf polish, test coverage, docs) before building more intelligence. |
| 4.2.1 | Shared Food-Resolution Core | One resolution engine used everywhere (`food-core.js`). Foundation for all later phases. Includes the initial benchmark suite. |
| 4.2.2 | Candidate Reranking | Always show the best food first — brand understanding, base-food prioritization, popularity, context, duplicate reduction, semantic matching. Benchmark-driven; depends on 4.2.1. |
| 4.2.3 | Confidence, Ambiguity Detection & Clarification | Only ask when confidence is genuinely low — confidence scoring, ambiguity detection, clarification generation, explained uncertainty. Depends on ranking (4.2.2). |
| 4.2.4 | Correction Memory | Learn from corrections so future resolution improves — session + persistent, user-specific, shared across surfaces. Depends on confidence (4.2.3). |
| 4.2.5 | Vague Portion Intelligence | Understand human portions (bowl, plate, scoop, handful, cup, slice, restaurant serving) using context. Depends on memory (4.2.4). |
| 4.2.6 | Meal-Level Reasoning | Understand whole meals, not isolated foods (burgers, sandwiches, salads, pasta, burritos, pizza, breakfast plates) — sides, sauces, toppings, duplicate prevention, cross-food reasoning. |
| 4.2.7 | Food-Resolution Benchmark Suite | Industry-leading evaluation — thousands of cases, regression suite, continuous evaluation, confidence calibration. Every improvement must be measurable. |
| 4.2.8 | Nutrition Intelligence Polish | Final hardening and calibration of the nutrition intelligence stack before shifting focus to new surfaces and coaching. |

### Parallel foundation track

| Phase | Name | Purpose / dependency |
|---|---|---|
| 4.2.1E | Shared Exercise Intelligence Foundation | Stable exercise identity + metadata (backfill the existing 57 exercises, `exercise_id` identity, replace name/equipment regex inference with metadata, protect history/PRs/substitutions/progression from name drift, add benchmark coverage). Same architectural class of problem as 4.2.1, for exercise. **Parallel track — not a food subphase.** Runs after 4.2.1 (or alongside the food sequence if branches/scopes stay clean); the nutrition sequence is unchanged by it. If only one track can run at a time: 4.2.1 → 4.2.1E → resume at 4.2.2. Details in `docs/exercise-intelligence-roadmap.md`. |

### Surfaces, coaching, and beyond

| Phase | Name | Purpose / dependency |
|---|---|---|
| 4.3 | Voice Logging | The user speaks normally; the shared intelligence does the rest. A new input surface over the existing core — not new intelligence. |
| 4.4 | Read-Only AI Coach | Understand before acting — read-only tools over nutrition, workouts, progress, weight, habits, goals, compliance, trends. No DB modifications. Builds on both foundations (4.2.1 + 4.2.1E). |
| 4.5 | AI Coach Action Tools | Safely let the coach perform work (log/edit/delete/save meals, update goals, schedule reminders, workout actions). Every action requires permission, confirmation, and undo. Depends on 4.4. |
| 4.6 | Macro-Aware Meal Recommendations | Recommend the next best meal from remaining macros, timing, workout schedule, preferences, restaurants, adherence. Depends on coaching + resolution. |
| 4.7 | Preference Learning | Learn who the user is (foods, brands, restaurant habits, timing, workout preferences, adherence, motivation). Continuously improving preference model. |
| 4.8 | Notifications & Proactive Coaching | The right message, to the right person, at the right time (protein/water/workout/meal/recovery/weight reminders, habit detection). Depends on preference learning. |
| 4.9 | Photo Logging | Photo → vision → **food-resolution core → meal reasoning → portion intelligence → correction memory** → confirmation → log. Almost all intelligence already exists by this point. |
| 4.9.5 | Personal Knowledge Graph | One living, structured model of the user (goals, nutrition, training, lifestyle, behavior) that every AI feature reads and updates. |
| 5.0 | Full Adaptive AI Coach | Everything converges: the coach can learn, reason, remember, plan, adapt, explain, and safely act on verified user data + shared platform intelligence. The user interacts with a coach, not features. |

---

## 12. DEFERRED ROADMAP ITEMS

### Saved Meals 2.0 — Future UX Polish (Planned, deferred)

**Do not interrupt the current shared-intelligence roadmap (§11) for this work.** Future scope:

- Rename saved meals
- Edit saved meal contents
- Add or remove foods
- Change serving sizes
- Improve saved-meal organization
- Swipe-to-delete
- Other gesture-based interactions

These belong in a later UX-polish phase, not the current architecture refactor.

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

- **`Live`:** Auth (login/signup/logout/reset, Google OAuth), onboarding + macro calculation, dashboard (`app.html`), calorie/macro calculator (`calculator.html`), program library + purchase pages, Stripe one-time purchases + subscriptions + customer portal, weight logging + trend (`weight.js`), workout logging + history + progressive overload (`workout*.html`, `progression.js`), nutrition tracking with USDA food search/barcode/saved meals (`nutrition.html`, `nutrition.js`, `food-core.js`), and **AI natural-language text food logging** (`/api/ai-food-parse` → shared core → USDA → user confirmation).
- **`Planned` / in progress:** the full AI Coach chat, voice logging, photo logging, habit tracking expansion, and the intelligence phases in §11.

**Note on "voice" vs "text":** the current AI food-logging feature is **text** natural-language
logging (AI Quick Log). Voice logging is `Planned` (Phase 4.3) and will consume the same shared core.
Older docs that described "voice" as live were conflating the two.

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
  - **Voice** — `Planned` (Phase 4.3). Speech → shared core; user confirms.
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
*(Backfilling this metadata for the existing 57 exercises is Phase 4.2.1E — see §11.)*

---

## 19. WEBSITE STRUCTURE

### Public Pages
- **Home** (`index.html`) — Hero, Benefits, Calculator CTA, Testimonials, Programs, Membership, Contact
- **About** — Company story, mission, coach bio
- **Programs / Store** (`store.html`) — All products with details, purchase options, reviews
- **Pricing** — Plan comparison
- **Contact** — Form, email, social links, WhatsApp

### Member Pages
- **auth.html** — Login / sign up
- **onboarding.html** — Goal questionnaire + macro setup (new users + Google OAuth)
- **app.html** — Member dashboard (returning users)
- **nutrition.html** — Nutrition tracking + food logging
- **weight-history.html** — Weight trend + logging
- **workout.html / workout-history.html / workout-complete.html** — Workout logging + history
- **program-fat-loss.html / program-muscle-gain.html / program-glute-builder.html** — Program pages (`Live`)
- **reset-password.html** — Password reset

### Dashboard Displays
Today's workout · Weight trend · Calories · Protein · Steps · Water · Sleep · Streak · Progress summary · AI Coach access · Program access

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

---

*End of CLAUDE.md — All sections are source of truth. Do not override without explicit instruction from Effi.*
