# Exercise-Intelligence Foundation — `exercise-core.js`
**Muscle Motivation · Phase 4.2.1E · Status: Live (shared code foundation)**
**Companion to:** `exercise-intelligence-architecture.md` (blueprint) and
`exercise-intelligence-roadmap.md` (sequence). This document is the reference for
the shipped shared module.

`exercise-core.js` is the exercise-domain equivalent of `food-core.js` (Phase
4.2.1): one pure, DOM-free, fetch-free, DB-free layer that owns *what an exercise
is* and *which exercise the user means*. Every current and future exercise
surface — the workout picker/search, workout logging, program rendering,
progression, substitutions, equipment-aware programming, voice logging, AI
workout generation, the AI coach — resolves through this one engine instead of
re-deriving its own taxonomy, normalization, families, or relationships.

Dual runtime (same pattern as `progression.js`): browser global
`ExerciseIntelligence` (load `<script src="exercise-core.js">` before consumers)
+ guarded `module.exports` for Node routes/tests/benchmarks.

---

## 1. Why this phase needed no migration

The Phase-1 metadata backfill (`docs/phase1-metadata-backfill.DRAFT.sql`) is
**already applied to production**. Audit at build time (read-only):

- `public.exercises` = **57 rows**, id-set checksum
  `53db1ebbc332b2ccee9ee0ebb726166a` (matches the DRAFT's expected checksum).
- **0 NULLs** in `movement_pattern`, `force_type`, `difficulty`, `instructions`,
  `tips`, `tracking_type`, `default_unit`. `aliases` populated on 56/57 (only
  *Seated Calf Raise* is empty — benign).
- Reference tables intact: `workout_exercises` (369 rows, `exercise_id` nullable
  FK), `personal_records` (182, name-keyed), `user_exercises` (119, custom),
  `program_workouts` (47 JSONB), `workout_templates` (31 JSONB).

So the DB is already a usable knowledge base with stable ids. 4.2.1E is therefore
a **pure additive shared-code** phase: no DDL, no data writes, no id changes, no
UI changes. The module keys off the same `exercises.id` values, so a
`canonicalExerciseId` it returns **equals** the production row id.

Audit findings recorded (not "fixed" — curated data is preserved):
- `equipment` is Title Case (`Barbell`) while the other structured fields are
  lowercase snake_case (`horizontal_push`). `normalizeEquipment` reconciles both.
- `movement_pattern` deliberately diverges from `category` (a UI grouping): e.g.
  *Bulgarian Split Squat* is `category=Squat` / `pattern=lunge`; *Dips* is
  `category=Triceps` / `pattern=vertical_push`; *Box Jump* is `Plyometric` /
  `squat`. The intelligence keys off `movement_pattern`, never `category`.
- The muscle vocabulary is broader than the blueprint's suggested list (`Abs`,
  `Upper Chest`, `Rear Delts`, `Full Body`, …). Validation treats muscles as
  free-ish (region-mapped), not a hard enum.
- *Farmer Carry* carries two aliases that normalize identically (`farmers walk`
  and `farmer's walk`) → validation reports a `duplicate_alias` warning. Left
  as-is (harmless redundancy).

---

## 2. Canonical schema (the catalog contract)

The module reasons over exercise records shaped like a trimmed `exercises` row.
Only `id` + `name` are required; everything else degrades safely.

```
{ id, name, category, equipment, primary_muscle, secondary_muscles[], aliases[],
  movement_pattern, force_type, difficulty, is_bodyweight, is_unilateral,
  tracking_type, default_unit }
```

`ResolutionResult` (what `resolve()` returns):

```
{ query, normalizedQuery, matchType, confidence,
  canonicalExerciseId, canonicalName, matchedAlias,
  exerciseFamily, movementPattern, mechanics, equipment,
  primaryMuscles, secondaryMuscles, variantSignals, cautionTags,
  candidates[], provenance, reason? }
```

---

## 3. Controlled vocabularies (one shared taxonomy)

Exposed as `ExerciseIntelligence.*` and frozen here so no feature invents a
conflicting enum:

| Field | Allowed values |
|---|---|
| `MOVEMENT_PATTERNS` | squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull, vertical_pull, carry, rotation, isolation, core, gait |
| `EQUIPMENT` | barbell, dumbbell, machine, cable, bodyweight, kettlebell, band, smith, other |
| `FORCE_TYPES` | push, pull, static |
| `DIFFICULTIES` | beginner, intermediate, advanced |
| `TRACKING_TYPES` | weight_reps, bodyweight_reps, weighted_bodyweight, time, distance, time_distance |
| `DEFAULT_UNITS` | lb, kg, sec, m, mi |

Compound vs isolation is derived from the pattern (`COMPOUND_PATTERNS` /
`ISOLATION_PATTERNS`), never from a name regex — `getMechanics(ex)` returns
`isolation` for isolation/core/rotation patterns, else `compound`.

---

## 4. Normalization & alias rules

- `normalizeExerciseName(name)` — lowercase; drop apostrophes (`farmer's` →
  `farmers`); every non-alphanumeric run (hyphen, slash, comma, parens) → a
  single space; collapse whitespace. `Pull-Up`, `pull up`, `pullup` all collapse;
  `Incline` vs `Flat` never does.
- `buildExerciseLookupKey(name)` — the aggressive matching key: normalize →
  expand abbreviations (`db`→dumbbell, `bb`→barbell, `kb`→kettlebell; phrase
  forms `ohp`→overhead press, `rdl`→romanian deadlift, `bss`→bulgarian split
  squat) → singularize tokens (`curls`→curl, `crunches`→crunch; never touches
  `press`).
- Exercise-specific abbreviations mostly live in the DB `aliases`, which the
  resolver indexes directly — the abbreviation lexicon is intentionally small.

Distinction the system enforces (per blueprint §7):
1. **True aliases** → resolve to the canonical exercise (`exact_alias`).
2. **Closely related variants** → distinct canonical exercises (never collapsed).
3. **Same-family exercises** → grouped, but each keeps its own identity.
4. **Unrelated overlapping words** → ambiguous, never a confident single pick.

---

## 5. Variant guard (why variants never silently collapse)

Query modifier tokens are split into **HARD** (change *which* exercise it is:
incline, decline, flat, front, back, rear) and **SOFT** (change loading, not
identity: assisted, weighted, banded, deficit, paused, tempo, eccentric, …).

- A query demanding a HARD modifier only matches a name/alias string that
  contains it. If the base movement exists but that hard variant does not,
  the result is **`unresolved` (`reason: variant_not_in_catalog`)** — never a
  silent collapse. (`front squat` → unresolved, not back squat.)
- When multiple candidates match, one carrying an **unrequested** hard modifier
  is out-ranked by one without — so `DB bench` → *Dumbbell Press* (flat), not
  *Incline Dumbbell Press*.
- A SOFT modifier the candidate lacks only lowers confidence to `low`
  (`reason: soft_modifier_approximate`) — `assisted pull-up` → *Pull-Up* as an
  approximate variant, explicitly **not** an `exact_alias`.

---

## 6. Family model

Membership criterion: **same base movement + same biomechanical intent**.
Equipment, grip, incline/flat, and unilateral are *variant modifiers within* a
family — not boundaries. A different base movement OR a different
`movement_pattern` is a different family. **Shared target muscle alone never makes
a family.**

For the curated 57, families are explicit (`FAMILY_BY_NAME`, keyed by normalized
name); uncurated/future exercises fall back to `movement_pattern + ':' + base
token` so a newly-seeded exercise still gets a stable family.

Deliberate decisions on the hard cases:

| Case | Decision |
|---|---|
| Back squat vs goblet squat | Same family `squat`, distinct variants (difficulty → progression). |
| RDL vs conventional vs trap-bar deadlift | Same family `deadlift`, distinct variants (execution intent preserved). |
| Barbell / dumbbell / machine / cable row | Same family `row` (equipment substitutions). |
| Bench press vs push-up | **Different** families (`bench-press` vs `push-up`); linked only as same-pattern alternatives. |
| Leg press vs back squat | **Different** families (`leg-press` vs `squat`); same-pattern alternative, not same family. |
| Pull-up vs lat pulldown | **Different** families (`pull-up` vs `pulldown`); same vertical-pull pattern. |
| Leg extension vs squat | **Different** families; isolation → **no** relationship at all. |
| Cable fly vs bench press | **Different** families; isolation vs compound → **no** relationship. |

---

## 7. Relationship graph

`getExerciseRelationships(idOrEx, catalog)` (or `index.getRelationships(id)`)
returns typed, directional relationships. A future decision engine chooses which
is right for a given user; the graph only *describes*.

| Type | Direction | When |
|---|---|---|
| `equipment_substitution` | lateral | Same family, different equipment (near-equivalent). |
| `variant` | lateral | Same family, same equipment (near-equivalent). |
| `progression` / `regression` | harder / easier | Same family, difficulty delta. |
| `same_pattern_alternative` | lateral | **Different** family, same **compound** pattern **+ force + region**. |

Conservative by construction: never links by shared muscle alone; never
self-links; isolation/core/rotation get **no** cross-family net (prevents broad
muscle-only substitution). Directional edges are emitted from both sides
(`A→B progression`, `B→A regression`) — that is intentional, not a duplicate.

Caution/demand tags (`getDemandTags`) are **descriptive only** (e.g.
`overhead_range_of_motion`, `deep_knee_flexion`, `axial_spinal_loading`,
`unilateral_balance`, `grip_endurance`) — never medical claims. This phase does
not prescribe or diagnose on them (blueprint §16).

---

## 8. Match types & confidence (deterministic)

| matchType | confidence | Meaning |
|---|---|---|
| `exact_canonical` | high | Query == a canonical name (normalized). |
| `exact_alias` | high | Query == a stored alias (normalized). |
| `normalized` / `normalized_alias` | high | Query == the expanded lookup key of a name/alias. |
| `variant` | medium / low | Unique token/variant match; `low` when a soft modifier is unmet. |
| `family` | low | Multiple candidates, all one family — "we know the family, not the variant". |
| `ambiguous` | low | Multiple candidates spanning families. |
| `prefix` | medium | Partial-word prefix, single hit. |
| `unresolved` | none | No match, or a demanded hard variant absent from the catalog. |

`family`/`ambiguous`/`unresolved` return `canonicalExerciseId: null` with a
`candidates[]` list — the system never fakes certainty on a broad term.

---

## 9. Validation

`validateExerciseCatalog(catalog, { relationships? })` (and
`validateRelationships(rels, catalog)`) return `{ ok, errors[], warnings[],
counts }`.

- **Errors** (identity-breaking): missing id, missing canonical name, duplicate
  canonical name, alias collision across exercises, relationship source/target
  missing, self relationship, circular progression chain.
- **Warnings** (drift/soft): invalid movement_pattern / force_type / difficulty /
  tracking_type / default_unit / equipment, duplicate alias within a row, alias
  shadowing another canonical name.

The production catalog passes with **0 errors** (1 warning: the Farmer Carry
duplicate-normalized alias noted in §1).

---

## 10. Integration & the progression seam

`progression.js` no longer has to parse equipment/mechanics back out of the name.
Its `analyze(input)` now accepts optional `input.equipment` and `input.mechanics`
(the name regex remains the fallback — **exact behavioral parity when they are
omitted**). Callers feed them from the shared layer:

```js
const meta = ExerciseIntelligence.getProgressionMeta(exerciseRow);
// { equipment: 'bodyweight'|'dumbbell'|'cable'|'machine'|'barbell'|'other',
//   mechanics: 'compound'|'isolation' }
Progression.analyze({ exerciseName, equipment: meta.equipment, mechanics: meta.mechanics, history });
```

This is the one integration shipped in 4.2.1E — enough to prove the layer is
consumable end-to-end. The workout picker/search (roadmap Phase 3) and PR/history
id-migration (Phase 6) are the next consumers and are intentionally **not** in
this phase.

---

## 11. How future features consume the layer

- **Search / picker:** `const idx = ExerciseIntelligence.createExerciseIndex(catalog)` once per catalog load, then `idx.resolve(query)`.
- **Substitutions / equipment-aware programming:** `idx.getRelationships(id)`, filtered by the consumer's equipment/difficulty policy.
- **Voice / AI logging:** run the transcript/parse through `resolve()`; `family`/`ambiguous`/`unresolved` drive the confirm/clarify prompt (mirrors the nutrition confidence rule).
- **AI workout generation:** select by `movement_pattern` / `getExerciseFamily` / `getMechanics`; output references `canonicalExerciseId`.
- **Progression / analytics:** `getProgressionMeta`, `getMechanics`, `getExerciseFamily`.

**Rule:** no exercise feature builds its own identity, taxonomy, normalization,
family, or relationship logic — it goes here, is covered by
`exercise-core.test.js` + `benchmarks/exercise-cases.jsonl`, and every surface
consumes it.

---

## 12. Known limitations / deferred

- **Catalog snapshot for tests:** `benchmarks/exercise-fixtures.js` mirrors the
  live 57 rows; production loads from Supabase. Regenerate the fixture if the
  catalog changes (the id checksum guards drift).
- **Picker integration shipped (Phase 4.2.1F):** `workout.html` now consumes the
  shared layer through `index.search()` (see §13); the old substring filter
  remains only as a degrade-safe fallback when the module can't load. `app.html`
  runs no picker.
- **PRs / history still name-keyed:** the id-migration sweep (Phase 6) is future.
- **Custom exercises (`user_exercises`) have no stable id** (blueprint §9.2
  identity convergence) — a designed schema migration, future and approval-gated.
- **Relationships are derived, not stored:** computed from family + pattern each
  call. If a persisted/curated override graph is ever needed,
  `validateRelationships` already validates an explicit list.

---

## 13. Picker integration — `index.search()` (Phase 4.2.1F)

The workout exercise picker (`workout.html`) is the first production consumer of
the shared layer. `resolve()` answers *which single exercise the user means* (for
auto-select/confidence); its sibling **`index.search(query, opts)`** answers
*which exercises the picker should SHOW, best first*. Both share the exact same
normalization, alias index, and hard-modifier variant guard — `search()` is not a
second resolver, just a ranked projection of the same matching over every record.

- **Result shape:** `{ query, normalizedQuery, results[], resolution }`. Each
  result is `{ id, name, exercise (the raw catalog row), family, equipment,
  matchType, matchedAlias, unrequestedHardModifier, missingRequestedModifier }`.
  `resolution` is the full `resolve()` verdict, so a consumer distinguishes a
  confident single answer from a `family`/`ambiguous`/`variant_not_in_catalog`
  list without re-deriving it. Convenience: `searchExercises(query, catalog, opts)`.
- **Ranking order** (deterministic; lower tier wins, then a fixed penalty vector):
  `exact_canonical` → `exact_alias` → `normalized` → `normalized_alias` →
  `variant` (all base tokens present, demanded hard modifiers satisfied) →
  `related` (base present but a **demanded hard modifier is absent** — a nearby
  option, never the exact result) → `prefix` → `partial`. Within a tier the
  penalty vector is `[missingRequestedHardMod, unrequestedHardMod, missingSoftMod,
  extraTokens, aliasOverName]`, final tie-break by normalized name. So "DB bench"
  ranks flat *Dumbbell Press* above *Incline Dumbbell Press*, and "incline bench"
  ranks *Incline Bench Press* above flat.
- **Variant safety in a list:** a demanded hard modifier the catalog lacks drops
  every candidate to `related` and leaves `resolution.matchType === 'unresolved'`
  (`front squat`, `smith squat`) — the picker shows a *"No exact match … closest
  options"* hint and never labels a nearby variant as exact. Selection is always a
  deliberate tap; nothing is auto-logged.
- **Identity:** `workout.html` builds the index over the GLOBAL catalog only, so
  every result `id` is a real `exercises.id`. The picker stamps that id onto the
  logged `workout_exercises.exercise_id` (validated against the loaded catalog),
  and always saves the canonical `name` — never the matched alias/search text.
  User customs (`user_exercises`, no stable FK id) stay out of the index and are
  surfaced by a lightweight name pass with a null id, exactly as before.
- Covered by `exercise-search.test.js` and the `picker`-tagged cases in
  `benchmarks/exercise-cases.jsonl` (search-aware assertions in `run-exercise.js`).
