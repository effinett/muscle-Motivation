# Exercise Intelligence — Architecture Blueprint
**Muscle Motivation · Tier 2 · Phase 2.3.2**
**Status: Planning / Source of truth. No code, migrations, or schema changes in this document.**

This is the long-term blueprint for the Exercise Intelligence layer — the foundation every
future exercise feature (Workout Builder, Program Builder, Progressive Overload, AI Coach,
substitutions, analytics, media) will build on. It is **additive**: nothing here breaks existing
workout history, templates, programs, progression, or exercise IDs.

---

## 1. Audit of the Current Exercise System

### 1.1 How exercises are selected today
- `workout.html` loads a search pool in `loadExerciseLibrary()`: the global `exercises` table
  (`id, name, category, equipment`) merged with the user's `user_exercises` rows, deduped by
  lowercased name.
- The picker (`filterPicker`) is a pure client-side **substring match** on `name` + `category`
  (`.includes(q)`). No alias matching, no ranking, no prefix priority, no typo tolerance.
- Selecting an exercise (`selectExercise`) inserts a `workout_exercises` row with `exercise_name`
  and a best-effort `exercise_id` from `libraryExerciseId(name)`.
- Free-typed names get a `+ Add "x"` row; on select they are saved to `user_exercises`
  (`saveUserExercise`) and logged **name-only** (no `exercise_id`).

### 1.2 How workouts reference exercises
- `workout_exercises` has **both** `exercise_name` (always set) and `exercise_id` (nullable FK →
  `exercises.id`). `exercise_id` is the new stable reference; `exercise_name` is the legacy/display
  field and the de-facto join key everywhere else.
- `workout_sets` hangs off `workout_exercises.id`. No exercise reference of its own — correct.

### 1.3 Systems still depending on names instead of IDs (the debt)
| Surface | Current key | Risk |
|---|---|---|
| `personal_records.exercise_name` (69 rows) | name (text) | PRs fragment if an exercise is renamed or typed with a variant spelling |
| History/last-performance lookups (4 sites: ~L931, L965, L1440, L1596) | `eq('exercise_name', ...)` | "Incline DB Press" ≠ "Incline Dumbbell Press" → split history, wrong progression |
| `program_workouts.exercises` (JSONB, 47 rows) | name | Program exercises can't reliably resolve to library metadata |
| `workout_templates.exercises` (JSONB) | name + `exercise_id` (recently added) | Partially migrated — id present, name still primary |
| `progression.js` `inferEquipment` / `classifyExercise` | **name regex** | Equipment & compound/isolation inferred from string parsing, not exercise metadata |
| `user_exercises` (47 rows) | own id, **no FK to `exercises`** | Customs can never carry a stable global id; permanently name-only |

### 1.4 Data debt inside the master table
- 57 exercises. `primary_muscle`, `category` (13 values), `equipment` (6 values), `aliases` are
  populated. But **`movement_pattern`, `force_type`, `difficulty`, `instructions`, `tips` are NULL
  on all 57 rows** — the schema is ready, the data is not.
- `workout_exercises`: **53% (43/81) have NULL `exercise_id`** — legacy rows logged before id
  capture, plus free-typed customs.
- `aliases` exists but is **never read** by search.

### 1.5 Which areas should migrate to exercise IDs (priority order)
1. History & last-performance lookups → resolve by `exercise_id`, fall back to name.
2. `personal_records` → add nullable `exercise_id`, backfill, dual-read.
3. `progression.js` → accept an optional exercise metadata object (equipment, category) instead of
   re-deriving from name; keep the name regex as fallback only.
4. `user_exercises` → reconcile into a single identity model (see §9.2) so customs can be promoted
   to stable ids.
5. `program_workouts` / `workout_templates` JSONB → carry `exercise_id` alongside name.

**Guiding rule for all of the above: dual-read (id-first, name-fallback), never id-only, until
backfill is complete and verified.**

---

## 2. The Exercise Intelligence Layer — Responsibilities

A single conceptual module (`ExerciseIntelligence`) that owns everything about *what an exercise is*
and *which exercise the user means*. It is the only place that talks to the `exercises` catalog.

**Inside the layer:**
- The canonical exercise catalog (read model) and its controlled vocabularies.
- Identity resolution: name/alias/free-text → stable `exercise_id` (or "unresolved custom").
- Search & ranking (basic → smart → fuzzy).
- Metadata accessors: equipment, muscles, movement pattern, tracking type, units, difficulty.
- Classification used by other systems (compound/isolation, push/pull, muscle group).
- Substitution candidate generation (rule-based now, AI-assisted later).

**Outside the layer (consumers, not owners):**
- Progressive overload math (`progression.js`) — *consumes* metadata, owns the rep/weight logic.
- Workout/Program Builders — *consume* search + selection, own session structure.
- Analytics — *consume* `exercise_id`, own aggregation.
- AI Coach — *consumes* metadata + substitution candidates, owns the conversation.
- Media — *referenced by* exercise, stored outside the table (see §7).

**Why this seam matters:** today `progression.js` re-derives equipment from the name with a regex.
That logic belongs to Exercise Intelligence (the exercise *knows* its equipment). The engine should
ask the layer, not parse strings. The regex stays only as a fallback for unresolved customs.

---

## 3. Exercise Data Standards (Controlled Vocabularies)

Free-text fields are the root cause of the name-matching debt. Lock the structured fields to
controlled vocabularies; keep prose fields free.

| Field | Type | Standard |
|---|---|---|
| **name** | text, unique | Canonical, Title Case, equipment spelled out: "Incline Dumbbell Press" not "Incline DB Press". One canonical name per movement. |
| **aliases** | text[] | Lowercased synonyms & abbreviations: `{"incline db press","incline db bench"}`. The matching surface — see §4. |
| **category** | enum | Use the CLAUDE.md movement categories: Squat, Hinge, Horizontal Push, Vertical Push, Horizontal Pull, Vertical Pull, Core, Carry, Biceps, Triceps, Calves (+ Cardio, Plyometric already present). Freeze this list. |
| **equipment** | enum | `barbell, dumbbell, machine, cable, bodyweight, kettlebell, band, other`. |
| **primary_muscle** | enum | Single value from a fixed muscle list (chest, back, quads, hamstrings, glutes, shoulders, biceps, triceps, calves, core, forearms, traps, lats…). |
| **secondary_muscles** | text[] | Same muscle vocabulary as primary. |
| **movement_pattern** | enum | `squat, hinge, lunge, horizontal_push, vertical_push, horizontal_pull, vertical_pull, carry, rotation, isolation, core, gait`. **Currently NULL — populate.** |
| **force_type** | enum | `push, pull, static`. **Currently NULL — populate.** |
| **difficulty** | enum | `beginner, intermediate, advanced`. **Currently NULL — populate.** |
| **tracking_type** | enum | `weight_reps, bodyweight_reps, weighted_bodyweight, time, distance, time_distance`. Drives which inputs the logger shows. |
| **default_unit** | enum | `lb, kg, sec, m, mi`. |
| **is_bodyweight / is_unilateral** | bool | Already present; keep. |
| **instructions / tips** | text | Free prose. Brand voice (CLAUDE.md §10): clear, practical, no bro-science. **Currently NULL — populate.** |

**Recommendation:** enforce vocabularies at the application/seed layer first (a shared constants
module). Promote to DB `CHECK` constraints or lookup tables only once the vocab is stable — that is
a later, additive migration, explicitly out of scope for this phase.

---

## 4. Search Architecture (design only)

Exercise search is small-N (hundreds, later 1,000+) and latency-sensitive in a picker. Recommended
path: **client-side ranked search now, server-side fuzzy later.**

**Matching layers, in order of implementation:**
1. **Basic (exists):** case-insensitive substring on `name`.
2. **Alias matching (next, highest ROI):** also match against the `aliases[]` array. The column
   already exists and is wasted today. "db" → finds dumbbell rows.
3. **Prefix priority:** a query that is a prefix of the name ranks above a mid-string match
   ("ben" → "Bench Press" before "Dumbbell Bench Press").
4. **Ranking:** score = exact name (100) > name prefix (80) > alias exact (70) > alias prefix (60) >
   name substring (40) > alias substring (30) > category match (10). Tie-break by popularity (§8),
   then alphabetical.
5. **Typo tolerance (later):** lightweight edit-distance (Levenshtein ≤1–2) only when the ranked
   list is empty, so it never slows the common case.
6. **Fuzzy (future, server-side):** Postgres `pg_trgm` + GIN index for similarity search once the
   catalog and traffic justify it. Additive — no client change required.

**Recommended implementation order:** alias matching → prefix priority → ranking → empty-state typo
tolerance → (later) `pg_trgm`. Steps 1–4 are pure client logic over the already-loaded library;
ship them before any DB work.

---

## 5. Exercise Selection UX (design only)

Reuse the existing bottom-sheet picker; layer intelligence into it.

- **Adding:** search field focused, full library below, ranked (§4). Tap = add.
- **Filtering:** chips above the list — Muscle, Equipment, Category, "Bodyweight only", "Home"
  (equipment ∈ bodyweight/dumbbell/band). Filters compose with the text query.
- **Searching:** live ranked results; alias hits show why ("matched: incline db press").
- **Empty state:** never a dead end. Show "No match — + Add '<query>' as a custom exercise" plus a
  few popular suggestions. (Today the `+ Add` row already exists — keep it, make it the explicit
  empty-state CTA.)
- **Custom exercise creation:** inline create captures at minimum name; optionally prompt category +
  equipment so the custom can carry real metadata and a stable id (see §9.2). Must stay one-tap-fast.
- **Substitutes:** from an exercise card, "Swap" opens the picker pre-filtered to same
  `movement_pattern` / `primary_muscle`, ranked by closeness + equipment availability (§6).
- **Details:** tapping the name (not the +) opens a detail sheet — muscles, equipment, instructions,
  tips, history, PRs, later media. Read-only view of the catalog row.

Mobile-first per CLAUDE.md §5: large tap targets, minimal typing, sheet stays usable with the
keyboard open (the current fixed `pickerAddRow` zone already handles this — preserve it).

---

## 6. Future AI Integration (design only — do not build)

The metadata in §3 is precisely the feature set an AI coach needs. Keep AI as a *consumer* of the
layer; never let it write to the catalog directly.

- **Recommendations / AI-generated workouts:** AI selects from the catalog by `movement_pattern`,
  `primary_muscle`, `equipment`, `difficulty`. Output references `exercise_id` — so the generated
  workout flows straight into the logger and progression with zero name-matching.
- **Equipment substitutions / home alternatives:** "no barbell" → same `movement_pattern` +
  `primary_muscle`, filtered to available equipment. Rule-based candidate set first; AI ranks/explains.
- **Injury-friendly alternatives:** needs a `contraindications` / `joint_load` tag set (future
  additive metadata) — note it now, don't add the column yet.
- **Beginner-friendly:** filter on `difficulty = beginner`.
- **Muscle-balance suggestions:** combine catalog muscles with analytics (§8) — e.g. push:pull
  weekly-set ratio.
- **Progressive overload:** AI explains the deterministic output of `progression.js`; the engine
  stays the source of truth (it already exposes `VOLUME_LANDMARKS` as the seam for MEV/MAV/MRV).

**Principle:** AI reasons over structured metadata + `exercise_id`s; deterministic engines own the
math; the user confirms before anything is saved (mirrors the nutrition AI rule in CLAUDE.md §11).

---

## 7. Future Media Architecture (design only)

**Do not add media columns to `exercises`.** Media is large, versioned, and many-per-exercise.

- Store binaries in a Supabase Storage bucket, keyed by `exercise_id`:
  `exercise-media/{exercise_id}/{type}/{variant}.{ext}` (e.g. `.../photo/cover.webp`,
  `.../video/demo.mp4`, `.../diagram/primary.svg`).
- Model metadata in a future `exercise_media` table (`exercise_id` FK, `type`, `url`, `sort`,
  `is_primary`) — one row per asset, added only when media work begins.
- Types: photo, thumbnail, muscle diagram, video, animation.
- Convention over columns: a deterministic path scheme means the app can resolve a thumbnail by
  `exercise_id` before the metadata table even exists.
- Keep names brand-safe (CLAUDE.md §5): clean, premium, no neon/gaming aesthetic.

---

## 8. Future Analytics (design only)

All analytics key off **`exercise_id`** (with name fallback during migration). The relational model
already supports this — these are read-side aggregations, mostly additive.

- **Personal records:** migrate `personal_records` to carry `exercise_id` (backfill + dual-read).
  Logic already lives in `progression.evaluatePRs`.
- **Volume by muscle / weekly sets:** join `workout_sets → workout_exercises → exercises` and group
  by `primary_muscle` / `movement_pattern`. This is where `VOLUME_LANDMARKS` (MEV/MAV/MRV) becomes
  actionable.
- **Exercise popularity:** count distinct users/uses per `exercise_id` → powers search tie-break and
  default suggestions.
- **Favorites / recently used:** small per-user tables (`user_id, exercise_id, last_used_at`) →
  pin to the top of the picker. Additive.
- **AI insights:** consume the above aggregates; store nothing new in the catalog.

---

## 9. Scalability Review

### 9.1 Will the current schema hold? — Largely yes.
- **1,000+ exercises:** fine. UUID PK, `name` unique, small rows. Add a `pg_trgm` GIN index when
  fuzzy search lands (§4). Client-side load of the full list should switch to server-side search
  somewhere around the low thousands — design the picker to call a search function so this swap is
  invisible.
- **Multiple equipment types:** the enum covers it; widen the controlled list as needed (additive).
- **Renaming:** safe **because** consumers key off `exercise_id`. This is the core reason to finish
  the id migration (§1.5). Aliases absorb old spellings so search still finds renamed items.
- **Additional metadata:** the table already has generous structured + prose fields; new dimensions
  (e.g. `joint_load`) are additive nullable columns.
- **AI expansion:** structured vocab is the enabler — no schema blocker.

### 9.2 The one real architectural concern — dual exercise identity
`exercises` (global, FK target) and `user_exercises` (per-user, **no FK**) are two parallel identity
spaces. A custom exercise can never carry a stable `exercise_id`, so its history, PRs, and analytics
are permanently name-only — re-introducing the exact debt this phase exists to remove.

**Recommended direction (explain-first, build later):** converge on a single `exercises` table with
an ownership model — e.g. a nullable `owner_user_id` (NULL = global/curated, set = user custom) and
`is_active`/visibility flags. Customs then live in the same id space and FK target, can be promoted
to global, and inherit all of search/analytics/AI for free. **This is a schema change and is out of
scope for this phase** — flagged here as the highest-value future migration, to be designed
additively (new nullable column + backfill from `user_exercises`, dual-read during transition).

### 9.3 Multiple languages (future)
Don't translate in-row. When needed, add an `exercise_translations` table (`exercise_id`, `locale`,
`name`, `instructions`, `tips`) and keep `exercises` as the canonical (English) identity + metadata.
Aliases handle within-language synonyms today; i18n is a separate, additive concern.

---

## 10. Implementation Roadmap (safest order, after this planning phase)

Each phase is independently shippable and additive. Do not start the next until the current is
verified against existing history/templates/programs/progression.

1. **Data backfill (no code):** populate the NULL metadata on the 57 exercises
   (`movement_pattern`, `force_type`, `difficulty`, `instructions`, `tips`) and curate `aliases`.
   Highest ROI, zero risk — turns the existing schema into a usable knowledge base.
2. **Seed expansion:** grow the catalog toward full coverage using the §3 vocabularies, with
   metadata complete from row one. Preserve all existing ids.
3. **Basic + alias search:** activate `aliases` in `filterPicker`; add prefix priority. Pure client.
4. **Smart search / ranking:** scoring model (§4 step 4), popularity tie-break stub.
5. **Exercise picker upgrade:** detail sheet, better empty state, one-tap custom-with-metadata.
6. **Filters:** muscle / equipment / category / bodyweight / home chips.
7. **ID migration sweep:** dual-read history, PRs, and progression by `exercise_id`; backfill the
   43 NULL `workout_exercises.exercise_id` rows by name match where unambiguous.
8. **Favorites + recently used.**
9. **Substitutions (rule-based):** same pattern/muscle, equipment-aware.
10. **AI recommendations / substitutions / generated workouts** (consumes §3 + §6).
11. **Media** (§7 — storage + `exercise_media` table).
12. **Analytics** (§8 — volume-by-muscle, weekly sets, popularity, insights).

Identity convergence (§9.2) slots in before or alongside step 7 as its own designed migration.

---

## Constraints honored by this blueprint
- **All existing `exercise_id`s preserved** — every recommendation is additive.
- **Compatible with workout history, templates, programs, progression** via dual-read
  (id-first, name-fallback); no id-only cutovers until backfill is verified.
- **No breaking database changes proposed** for this phase; the one schema concern (§9.2) is flagged,
  explained, and deferred — not executed.
- **Additive-first** throughout: new columns nullable, new tables separate, search/analytics on the
  read side.

*End of blueprint. Planning only — no code, migrations, or frontend changes were made.*
