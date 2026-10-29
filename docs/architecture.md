# Muscle Motivation — Architecture Reference

Per-module detail for every shared core: contracts, invariants, seams, load order and test
coverage. Moved verbatim from the rules file (`AGENTS.md` §10) on 2026-10-19 so the rules file
stays short. **`AGENTS.md` §10 holds the one-line invariants; this file holds the detail.**
Read the relevant section before changing a shared module, and update it in the same change when a
contract or invariant changes.

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
- **Equipment-free Program sessions (`Live`, Phase 4.3.9B).** `isEquipmentFreeProgram(slug)`
  (Bodyweight Foundations only) and `isEquipmentFreeExercise(row)` are the ONE rule
  Swap and the manual picker share: an exercise qualifies only when it is in the
  reviewed 38-row pool (`EQUIPMENT_FREE_EXERCISE_IDS`, pinned to migration
  `20261003000515`'s `k_pool`) AND the catalog classifies it Bodyweight —
  classification alone would admit Pull-Up, Dips, Box Jump etc. `runDiscovery({
  equipmentFree })` and `findSubstitutions(ref, catalog, { candidateFilter })`
  consume it; `workout.html` applies it only to picks for the LIVE workout
  (never a Routine draft or history review), enforces it again at the commit
  boundary, and hides customs and the "+ Add" row. If the module fails to load, an
  equipment-free session fails closed (offers nothing) while every other Program
  keeps the original fallback picker; the page's one-entry fallback Program map is
  pinned by test to `EQUIPMENT_FREE_PROGRAM_SLUGS`. Covered by
  `exercise-filters.test.js`, `exercise-substitution.test.js` and
  `equipment-free-picks.test.js`.
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
- **Current baseline (Phase 4.2.10b, SHA `c837e587`):** 288 cases, 286 scored,
  overall **100%**, **false-confidence 0%** (0/31), clarification P/R 100%,
  portion/meal/parsing/display 100%, 2 informational. Benchmarks: food 116/116
  scored (5 live-tier skipped), exercise 188/188. The 4.2.9 figures (`47b9736` —
  99.6%, false-confidence 5%, the bare "coffee" case) are **superseded**.
- **A passing baseline proves correctness on the cases the corpus contains, not
  breadth of real-world coverage** — and `/api/ai-food-parse` free-text → items
  is **out of eval scope** entirely (non-deterministic model). Pre-launch breadth
  is certified separately and blockingly by roadmap **4.5.17**.

### Shared Personalization Core — `personalization-core.js` (`Live`, Phase 4.3.7 D/E/F)

The deterministic value layer: ONE answer to "what did Muscle Motivation build for
this person?". Pure — DOM-free, fetch-free, Supabase-free, clock-free,
randomness-free. Browser global `Personalization` + guarded `module.exports`; load
AFTER `program-catalog.js`. Consumed by `onboarding.html`, `app.html` (Home),
`workout.html` (Train).

- **Derived, not generated. No AI anywhere.** `derivePersonalizedStart(profile,
  {catalog, accessibleSlugs})` → `status · goal · nutrition · training · focus ·
  warnings · missing`. Every recommendation carries **stable reason codes**;
  ranking logic never composes a sentence — one static `REASON_COPY` table maps
  codes to words so every surface explains a decision identically.
- **It computes NO nutrition math.** BMR/TDEE/macro math lives in
  `calculator.html` (never modify), `onboarding.html` and `profile.html`'s recalc
  — and the latter two have already drifted. The engine **reads** the persisted
  `target_calories` / `protein_target` / `maintenance_calories` and reports them;
  deficit/surplus restates two stored numbers. Never add a fourth calculator.
- **Ranking is strictly lexicographic, not weighted:** goal rank → training-day
  delta (nulls last) → experience fit → equipment fit → `sort_order` → slug. A
  goal mismatch therefore can never win on schedule alone *structurally*, not by
  weight tuning. Fits are tri-state (1 / 0 / −1) so unreadable metadata is
  neutral, never penalised. **`recomp` → muscle, then fat loss**, emitting
  `goal_partial_match` (owner-approved 2026-08-27; no Program declares `recomp`).
- **No false precision.** A reason code appears only when its input exists AND
  actually separated the field — every published Program is `Any Setup`, so
  equipment claims nothing today. `programs.difficulty` is free display text and
  is resolved by EXACT normalized lookup; unknown = no signal, never a mismatch.
  A NULL profile field is always "no signal".
- **Recommendation ≠ access ≠ enrolment.** Ranking never reads purchases or
  entitlement; `accessible` is stamped afterwards and is `null` when not
  evaluated. Nothing here writes, so no `user_programs` row can result from a
  recommendation. Home/Train pass no `accessibleSlugs` and fetch no purchases.
- **4.3.7F is a derived READ MODEL, not a store.** `buildPersonalContext` returns
  the normalized personal-facts shape Coach (4.4.3) will read. **No
  personalization table exists** — goal, targets and training days keep one
  source of truth, so a profile edit re-derives the plan and cannot go stale.
- DB: `profiles.training_experience` + `profiles.gym_access` (Phase 4.3.7A,
  migration `phase_437a_profile_training_context`) — nullable, CHECKed, no
  default, no backfill. Covered by `personalization-core.test.js` and
  `personalization-ui.test.js`.

### Funnel Instrumentation — `analytics-core.js` (`Live`, Phase 4.3.7G)

The **only** analytics in the product, and deliberately not a platform. It answers one
question — of everyone who starts onboarding, how many finish — and must not grow into
general product analytics. Browser global `MMAnalytics`; loaded by `index.html`,
`onboarding.html` and `auth.html` ONLY.

- **No user id, no profile data, by construction.** An event carries an enum name, an
  opaque ephemeral `funnel_id`, a coarse route bucket, ONE categorical `detail` and a
  schema version. `emit(event, detail)` takes no other parameter, so profile data cannot
  be passed even by accident.
- **`public.funnel_events` is append-only and WRITE-ONLY from any browser** — INSERT
  policy only for `anon`/`authenticated`, and **no SELECT/UPDATE/DELETE policy at all**
  (the `public.leads` pattern). Reads happen via the service role, never in-browser.
- **The `detail` allowlist is per-event and enforced TWICE**: `FUNNEL_EVENTS` in the
  client for correctness, and the policy's `WITH CHECK` as the boundary. **Adding an
  event means changing both** — they must agree or rows are silently rejected.
- **It can never break the product.** Nothing awaits `emit`, every path swallows its own
  failure, and `emit` returns a boolean rather than a promise a caller could await.
- **An already-onboarded user emits NOTHING** and has their funnel id cleared, so a
  returning customer cannot inflate acquisition metrics. Sign-in is never a signup; a
  resume is never a start.
- **Not exactly-once, and does not pretend to be.** Dedupe is per funnel id in
  `sessionStorage`; multiple tabs are separate funnels; no retries, so a dropped event
  undercounts. Google signup is attributed by elimination (OAuth navigates away before
  `auth.html` can observe it) and can over-attribute in one rare case.
- Retention intent 180 days, no purge machinery. Covered by `analytics-core.test.js` and
  `funnel-wiring.test.js`.

### Other shared modules (`Live`)

- `metrics.js`, `snapshot.js` — dashboard snapshot/metrics.
- `weight.js`, `weight-history.html` — weight tracking + trend.
- `progression.js` (spec: `docs/progression-spec.md`) — progressive-overload logic; `schedules.js`, `workout-history.js` — workout support. `analyze()` now accepts optional `equipment`/`mechanics` exercise metadata (Phase 4.2.1E seam), name-regex inference as fallback — exact parity when omitted. **Phase 4.3.9B:** when a caller passes tracking metadata (`unit` or `trackingType`), `coachNote` and the Last/Today displays read in seconds for a timed exercise, and an `equipment: 'bodyweight'` exercise is never told to pick, add or increase weight; numbers and actions are unchanged, and a caller passing neither keeps the historical wording byte-for-byte. `workout.html` (`isNoLoadExercise`) and `workout-complete.html` (`noteMetaFor`) pass `equipment: 'bodyweight'` only for a catalog `is_bodyweight` row tracked as `bodyweight_reps` or `time` with no saved weight, and `workout.html` hides the weight input on exactly those exercises. Weighted bodyweight, equipment, custom, unresolved and already-weighted exercises are unchanged (`bodyweight-logging-units.test.js`).

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

