# Exercise Intelligence — Sequenced Implementation Roadmap
**Muscle Motivation · Tier 2 · Phase 2.3.2 → execution sequence**
**Companion to:** `exercise-intelligence-architecture.md` (the blueprint / source of truth)
**Status: Plan. No code in this document.**

Build order is **safest-first**: data quality before search, search before filters, everything before
the dual-identity schema change. Each phase is independently shippable and **additive** — finish and
verify one before starting the next.

**Global invariants (every phase must hold these):**
- Preserve all existing `exercises.id` values — never delete/recreate a catalog row to "fix" it.
- Never break workouts, templates, programs, progression, or history.
- New columns are nullable; new tables are separate; reads are dual-keyed (id-first, name-fallback).
- No id-only cutover until a backfill is verified.

---

## Phase 0 — Vocabulary Lock (prerequisite, no data writes)
**Goal:** Freeze the controlled vocabularies so backfill and seeding can't reintroduce free-text drift.

**Exact tasks**
- Write the canonical value lists into one shared reference (a constants doc/module): `category`,
  `equipment`, `primary_muscle`/`secondary_muscles`, `movement_pattern`, `force_type`, `difficulty`,
  `tracking_type`, `default_unit` — per blueprint §3.
- Pull the **current distinct values** from `exercises` for each field and map every existing value
  to an approved vocab term (flag anything that doesn't map).
- Define the canonical-name + alias style rules (Title Case, equipment spelled out; aliases lowercased).

**What NOT to touch**
- The database (read-only this phase). No constraints, no `CHECK`s yet.
- Any frontend or logic.

**Verification checklist**
- [ ] Every existing `category`/`equipment`/`primary_muscle` value maps to an approved term.
- [ ] Vocab lists reviewed and approved by Effi.
- [ ] No DB writes occurred.

**Change types:** none (documentation/constants only).

---

## Phase 1 — Metadata Backfill for the Existing 57 Exercises ← **NEXT BUILD PHASE**
**Goal:** Turn the existing schema into a usable knowledge base by filling the NULL metadata —
**without touching IDs, names, or any other table.** Highest ROI, lowest risk.

**Context:** `movement_pattern`, `force_type`, `difficulty`, `instructions`, `tips` are NULL on all 57
rows; `aliases` is sparse/unused. Columns already exist — this is data only.

**Exact tasks**
- For each of the 57 rows (matched by `id`), populate using Phase 0 vocab:
  `movement_pattern`, `force_type`, `difficulty`, `tracking_type` (verify, default is `weight_reps`),
  `default_unit`, `is_bodyweight`, `is_unilateral`.
- Write `instructions` + `tips` in brand voice (CLAUDE.md §10 — clear, practical, no bro-science).
- Curate `aliases[]`: lowercased synonyms/abbreviations (e.g. "incline db press", "db bench").
- Set `updated_at` on touched rows.
- Run as idempotent `UPDATE ... WHERE id = …` statements via tracked `apply_migration`
  (data migration), so it's repeatable and reversible. **No INSERTs, no DELETEs, no name changes.**

**What NOT to touch**
- `exercises.id`, `exercises.name` (renaming is out of scope here — aliases absorb variants).
- Any other table (`workout_exercises`, `personal_records`, `program_workouts`, templates, etc.).
- Frontend and logic — search still ignores the new fields until Phase 3.

**Verification checklist**
- [ ] `SELECT count(*) FROM exercises` still = 57 (no rows added/removed).
- [ ] Same 57 `id`s present as before (diff against a pre-change id snapshot).
- [ ] No NULLs remain in `movement_pattern`, `force_type`, `difficulty` (and `tracking_type`/`default_unit`).
- [ ] Every populated value ∈ Phase 0 vocab.
- [ ] All `name` values unchanged.
- [ ] App still loads workouts/picker normally (new fields are simply unused so far).
- [ ] Migration re-runs cleanly (idempotent).

**Change types:** **Seed/data change (via tracked migration). No schema, no frontend, no logic.**

---

## Phase 2 — Seed Expansion
**Goal:** Grow the catalog toward fuller coverage, with complete metadata from row one.

**Exact tasks**
- Add new exercises (movement categories per CLAUDE.md §12), each fully populated per Phase 0 vocab —
  no new NULL-metadata rows.
- De-dupe against existing 57 by canonical name + aliases before inserting.
- Insert via tracked migration; let `id` default (`gen_random_uuid()`).

**What NOT to touch**
- Existing 57 rows (no edits in this phase — Phase 1 owns those).
- Any other table; frontend; logic.

**Verification checklist**
- [ ] Original 57 `id`s untouched.
- [ ] No duplicate canonical names; no alias collisions with existing rows.
- [ ] Every new row passes the Phase 1 completeness check (no NULL required metadata).
- [ ] Picker shows new exercises (they flow through the existing global-list load automatically).

**Change types:** **Seed/data change. No schema, no frontend, no logic.**

---

## Phase 3 — Alias + Ranked Search (client-side)
**Goal:** Make search actually use the metadata — activate `aliases`, add prefix priority and ranking.

**Exact tasks**
- Extend the library load to include `aliases` (and the §3 metadata fields you'll display/filter on).
- Update `filterPicker` to match against `name` **and** `aliases`, with the §4 scoring model
  (exact > name-prefix > alias-exact > alias-prefix > substring > category), tie-broken
  alphabetically (popularity tie-break comes in Phase 7).
- Keep the existing `+ Add "<query>"` custom row and the fixed `pickerAddRow` zone behavior.

**What NOT to touch**
- The selection/insert path (`selectExercise`, `libraryExerciseId`) — resolution logic is unchanged.
- Database (read-only). No new columns.
- `progression.js`.

**Verification checklist**
- [ ] Alias query (e.g. "db bench") returns the right canonical exercise.
- [ ] Prefix matches rank above mid-string matches.
- [ ] Empty query still lists the full library; unknown query still offers `+ Add`.
- [ ] Picker performance unchanged on the full list.
- [ ] Selecting still stamps `exercise_id` exactly as before.

**Change types:** **Frontend + logic (client search). No schema, no seed.**

---

## Phase 4 — Picker UX Upgrade
**Goal:** Detail view, stronger empty state, one-tap custom-with-metadata.

**Exact tasks**
- Exercise **detail sheet** (tap name, not the +): muscles, equipment, movement pattern, instructions,
  tips, plus existing history/PR display. Read-only.
- Empty-state CTA: "No match — + Add '<query>'" plus a few suggestions.
- Optional category/equipment capture on custom create (kept one-tap-fast; fields optional).

**What NOT to touch**
- Identity/resolution model (still name-only customs until Phase 8).
- Database schema; `progression.js`.

**Verification checklist**
- [ ] Detail sheet renders for catalog exercises; degrades gracefully for name-only customs.
- [ ] Empty state never dead-ends.
- [ ] Custom create still works with name only.

**Change types:** **Frontend (+ light logic). No schema, no seed.**

---

## Phase 5 — Filters
**Goal:** Filter the picker by muscle / equipment / category / bodyweight / home.

**Exact tasks**
- Filter chips that compose with the text query, driven by the now-populated metadata.
- "Home" = equipment ∈ {bodyweight, dumbbell, band}; "Bodyweight only" = `is_bodyweight`.

**What NOT to touch**
- Resolution/insert path; database; `progression.js`.

**Verification checklist**
- [ ] Filters combine correctly with search ranking.
- [ ] Clearing filters restores full list.
- [ ] Customs without metadata still appear under an "uncategorized"/all view.

**Change types:** **Frontend + logic. No schema, no seed.**

---

## Phase 6 — ID Migration Sweep (dual-read)
**Goal:** Move history, last-performance, and PRs to resolve by `exercise_id` first, name as fallback —
and backfill the NULL `workout_exercises.exercise_id` rows where unambiguous.

**Exact tasks**
- Backfill `workout_exercises.exercise_id` (currently ~43/81 NULL) by exact name→catalog match;
  leave genuinely ambiguous/custom rows NULL (do not guess).
- Add nullable `exercise_id` to `personal_records`; backfill by name; **dual-read** (id when present,
  else name). No id-only writes yet.
- Update the 4 history/last-perf lookups in `workout.html` to prefer `exercise_id`, fall back to name.

**What NOT to touch**
- `exercise_name` columns (keep as fallback + display — do not drop).
- Existing `id`s; the progression math itself.
- Do not force-resolve ambiguous names — leaving NULL is safe.

**Verification checklist**
- [ ] Row counts unchanged in `workout_exercises`, `personal_records`.
- [ ] Pre/post spot-check: same user sees identical history + PRs for known exercises.
- [ ] Renamed/alias-variant logs now collapse to one history when ids match.
- [ ] Rows left NULL still work via name fallback (no regressions).
- [ ] `progression.test.js` still green.

**Change types:** **Schema (additive: one nullable column) + seed (backfill) + logic (dual-read). Frontend lookups updated.**

---

## Phase 7 — Favorites + Recently Used
**Goal:** Pin a user's favorites/recent exercises to the top of the picker; feed search tie-break.

**Exact tasks**
- New per-user tables (`user_id, exercise_id, last_used_at` / favorites). Additive, separate.
- Surface as a "Recent"/"Favorites" section atop the picker; wire popularity into Phase 3 tie-break.

**What NOT to touch**
- Catalog rows; resolution path; progression.

**Verification checklist**
- [ ] Recent updates after logging an exercise.
- [ ] Favorite toggle persists per user (RLS scoped to the user).
- [ ] Picker still works for users with no history.

**Change types:** **Schema (new additive tables) + frontend + logic. No catalog seed change.**

---

## Phase 8 — Exercise Identity Convergence (designed schema migration)
**Goal:** Bring custom exercises into the same id space + FK target as the catalog, so customs get
stable ids, history, PRs, and AI/analytics for free. (Blueprint §9.2 — the one real architectural change.)

**Exact tasks**
- **Design-first, get approval before any DDL.** Proposed shape: nullable `owner_user_id` on
  `exercises` (NULL = global/curated, set = user custom) + visibility/`is_active` handling.
- Backfill from `user_exercises` into `exercises` as owned rows (new ids; do not collide with globals).
- Dual-read during transition; promote-to-global path for popular customs (later).

**What NOT to touch**
- Existing global `id`s; existing global rows' behavior.
- Do not drop `user_exercises` until everything reads from the unified table and it's verified.

**Verification checklist**
- [ ] No global `id` changed.
- [ ] Every former `user_exercises` entry resolvable in the unified table, scoped by owner via RLS.
- [ ] Customs can now carry `exercise_id` on `workout_exercises`.
- [ ] No user sees another user's customs.

**Change types:** **Schema (additive column + backfill) + logic + frontend. Highest-risk phase — design + explicit sign-off required.**

---

## Phase 9 — Substitutions (rule-based)
**Goal:** "Swap" suggests same `movement_pattern` / `primary_muscle`, equipment-aware. No AI yet.

**Exact tasks**
- Candidate generator over the catalog (same pattern/muscle, ranked by closeness + available equipment).
- "Swap" entry point from an exercise card → pre-filtered picker.

**What NOT to touch**
- Catalog data; identity model; progression math.

**Verification checklist**
- [ ] Swap returns sensible same-pattern candidates.
- [ ] Equipment filter (e.g. home) respected.
- [ ] Swapping preserves the exercise's set/history linkage correctly.

**Change types:** **Frontend + logic. No schema, no seed.**

---

## Phase 10 — AI Integration (consumer)
**Goal:** AI recommendations / substitutions / generated workouts, referencing `exercise_id`.

**Exact tasks**
- Expose catalog metadata + substitution candidates to the AI layer (read-only consumer).
- AI output references `exercise_id`s; user confirms before save (mirrors nutrition rule, CLAUDE.md §11).

**What NOT to touch**
- AI must not write to the catalog. Deterministic engines (`progression.js`) keep owning the math.

**Verification checklist**
- [ ] Generated workouts resolve to real `exercise_id`s and flow into the logger.
- [ ] Nothing saves without user confirmation.

**Change types:** **Logic + frontend (+ API). No catalog schema change.**

---

## Phase 11 — Media
**Goal:** Photos, thumbnails, muscle diagrams, videos — without bloating `exercises`.

**Exact tasks**
- Supabase Storage bucket keyed by `exercise_id` (path scheme per blueprint §7).
- `exercise_media` table (`exercise_id` FK, type, url, sort, is_primary) — added only now.

**What NOT to touch**
- No media columns on `exercises`.

**Verification checklist**
- [ ] Detail sheet shows media when present, degrades cleanly when absent.
- [ ] Storage paths resolve by `exercise_id`.

**Change types:** **Schema (new additive table) + storage + frontend.**

---

## Phase 12 — Analytics
**Goal:** Volume-by-muscle, weekly sets, popularity, AI insights — all keyed on `exercise_id`.

**Exact tasks**
- Read-side aggregations joining `workout_sets → workout_exercises → exercises`, grouped by
  `primary_muscle` / `movement_pattern`; activate `VOLUME_LANDMARKS` (MEV/MAV/MRV).

**What NOT to touch**
- Catalog rows; write paths.

**Verification checklist**
- [ ] Volume-by-muscle reconciles with raw set logs for a sample user.
- [ ] Popularity counts feed search tie-break (Phase 3/7).

**Change types:** **Logic + frontend (read-side). Optional additive aggregate tables/views only.**

---

## Sequence at a glance
| Phase | Name | Schema | Seed | Frontend | Logic |
|---|---|---|---|---|---|
| 0 | Vocabulary Lock | — | — | — | — |
| **1** | **Metadata Backfill (57)** | — | ✅ | — | — |
| 2 | Seed Expansion | — | ✅ | — | — |
| 3 | Alias + Ranked Search | — | — | ✅ | ✅ |
| 4 | Picker UX Upgrade | — | — | ✅ | ◑ |
| 5 | Filters | — | — | ✅ | ✅ |
| 6 | ID Migration Sweep | ➕ | ✅ | ✅ | ✅ |
| 7 | Favorites / Recent | ➕ | — | ✅ | ✅ |
| 8 | Identity Convergence | ➕ | ✅ | ✅ | ✅ |
| 9 | Substitutions (rules) | — | — | ✅ | ✅ |
| 10 | AI Integration | — | — | ✅ | ✅ |
| 11 | Media | ➕ | — | ✅ | ◑ |
| 12 | Analytics | ◑ | — | ✅ | ✅ |

➕ additive only · ◑ optional/minor · ✅ yes · — none

*End of roadmap. Plan only — no code, migrations, or frontend changes were made.*
