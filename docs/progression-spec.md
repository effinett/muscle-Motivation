# Custom Workouts — Pre-Fill & Progression Refinement
## Final Implementation Specification

Status: **Approved** (2026-06-26). This document is the source of truth for the
pre-fill + double-progression/deload pass.

**Scope:** `progression.js`, `workout.html` (3 set-seeding seams + validation),
`progression.test.js`, this doc.

**Out of scope this pass:** equipment-aware increments, warm-up support,
`exercise_id` migration (sequenced to the next pass), per-set/pyramid logic, and
any change to purchased programs, dashboard launch, resume/discard, or workout
history.

---

## 1. Schema / Database changes

**None in this pass.** `workout_sets.weight_lbs` (nullable) and
`workout_sets.reps` (nullable) already support pre-filled weight + blank reps.

**`exercise_id` capture — sequenced to the NEXT pass, not this one** (approved).
Pre-specified for that pass:

> Add nullable `workout_exercises.exercise_id uuid` (FK → `public.exercises(id)`,
> `ON DELETE SET NULL`); add optional `exercise_id` to template/program exercise
> JSON; populate from the picked library item at write time; **keep progression
> matching by name** for now; switch the progression join to ID in a later pass.
> Free-text customs remain name-only until promoted.

---

## 2. Progression engine changes (`progression.js`)

`analyze()` output contract:

| Field | Behavior |
|---|---|
| `recommendedWeight` | number \| null — the value to pre-fill. `hold`→base; `increase`→`roundWeight(base+inc)`; `start`→`programmedWeight` or `null`. **Never lowered by a deload.** |
| `recommendedReps` | number — target reps (display only; not pre-filled) |
| `recommendedSets` | number ≥ 1 — number of sets to pre-create |
| `action` | `'start' \| 'increase' \| 'hold' \| 'incomplete'` — `'reduce'` removed |
| `deloadSuggested` | boolean — advisory only |
| `deloadWeight` | number \| null — suggested lower weight if user accepts (`≈ round(0.9×base)`, `< base`); only when `deloadSuggested` |
| `deloadReason` | `'stall' \| 'regression' \| null` |
| `plateau`, `goalRange`, `lastPerformance`, `coachNote`, `hasHistory`, `equipment` | unchanged |

**Removed:** the single-session "severe miss → auto-reduce ~10%" branch. Any
working set below the floor now → `hold` (`recommendedWeight = base`,
`recommendedReps = low`). Weight only ever decreases via an **accepted** deload.

**Deload detection** (advisory only, never when `action==='increase'`):
- **Regression** (≥2 sessions): `bestE1RM(last) < 0.9 × bestE1RM(prev)` →
  `deloadReason='regression'`.
- **Stall** (≥3 sessions): base weight identical across the last 3 sessions AND
  `bestE1RM` not improved across them (newest ≤ oldest + ε) → `deloadReason='stall'`.
- `deloadWeight = roundWeight(base × 0.9)`; if `≥ base`, use `base − increment`;
  floor 0. (`null` for bodyweight.)

**Unchanged:** double-progression gate (`minReps ≥ high` → increase, reset to
`low`), in-range hold + rep nudges, `incomplete` branch (completed < target →
hold, keep target count), most-common/heavier-tie base selection, nearest-5
rounding, bodyweight handling.

---

## 3. Workout UI behavior (`workout.html`) — pre-fill

Pre-fill runs **only when sets are first created**, in all three seams:
`startProgramSession`, `startTemplateSession`, manual `selectExercise`/`addSet`.

Per created set: `weight_lbs = analyze().recommendedWeight` (may be `null`),
`reps = null`, `completed = false`, `is_warmup = false`. Set count =
`analyze().recommendedSets`.

- Source of truth = `analyze().recommendedWeight`, not `loadLastPerf.last_weight`
  (makes inputs match the "Today" rec row).
- Reps always blank. Weight is the plan; reps are the measured result.
- Manual `addSet`: first set → `recommendedWeight`; additional sets → copy the
  previous set's current **weight only**, reps blank.
- Mid-workout weight edit does NOT change sibling sets (no propagation).
- Deload: when `deloadSuggested`, show a `Deload?` badge + "Drop to {deloadWeight}".
  Pre-filled weights stay at current weight; accepting applies `deloadWeight` to
  **weights only** (reps stay blank), one tap, never automatic.
- First-time / no recommendation → weight blank + placeholder; never a guess.
- Bodyweight (`recommendedWeight = null`) → weight blank.

---

## 4. Resume behavior

`loadExercisesForWorkout()` renders stored set values verbatim and applies **no**
pre-fill. Pre-fill lives exclusively in the create seams. `applyTemplateRanges()`
still restores `reps_low/high` for display only. Resuming preserves exactly what
the user entered, including blanks.

---

## 5. Validation rules

- A set counts as a working/completed set only if `reps` is a number > 0.
- Completion guard (`toggleSet`): marking complete requires `reps > 0`; otherwise
  block with a toast and leave it incomplete. Weight is not required (bodyweight).
- Clearing reps on a completed set auto-reverts that set to incomplete (no
  checked-but-uncounted sets).
- `recommendedSets` clamped to ≥ 1.
- Pre-filled-but-untouched sets (weight present, reps blank) never enter history
  or PRs.

---

## 6. Edge cases

| Case | Behavior |
|---|---|
| No history, no programmed weight | Weight blank + placeholder; reps blank |
| Bodyweight exercise | Weight blank; reps blank; set count still pre-created |
| Increase lands on unloadable number | Pre-fill rounded value; user edits once |
| `deloadSuggested` | Weight held; badge + one-tap drop to `deloadWeight` |
| Last session incomplete (sets < target) | `hold`, keep target set count |
| Last session pyramided/mixed weights | Engine uses most-common/heavier base |
| Below floor, single session | `hold` (no auto-reduce) |
| Resume in-progress workout | No pre-fill, no overwrite |
| Same exercise twice in one workout | Each instance pre-fills from name history |
| Edit Set 1 weight | Sets 2–3 unchanged |
| Reps entered then cleared on a completed set | Set reverts to incomplete |
| Program exercise with no stored weight | First-time → blank |

---

## 7. Documented limitations

1. Straight working sets only — pyramid/ramp/drop sets logged manually are not
   progressed accurately.
2. No warm-up support — all logged sets treated as working sets.
3. Increment rounding is nearest-5 lb — `increase` recs may need a manual edit on
   machines/cables/fixed dumbbells. (`hold` is always exact.)
4. History matched by `exercise_name` until the ID migration — renames/typos split
   history.
5. Bodyweight + added load not modeled.
6. Timed holds (planks as "reps" = seconds) — double progression not meaningful.

---

## 8. Test plan

**Engine unit tests (`progression.test.js`):**
- Increase: all sets at top → `increase`, weight `base+inc`, reps reset to `low`.
- In-range: hold, reps nudge toward top.
- Below floor, single session: `hold`, `recommendedWeight === base` (regression
  test for removed auto-reduce).
- Regression deload: `bestE1RM(last) < 0.9×bestE1RM(prev)` → `deloadSuggested`,
  `deloadReason='regression'`, `recommendedWeight === base`, `deloadWeight < base`.
- Stall deload: 3 sessions, same base weight, flat E1RM → `deloadSuggested`,
  `deloadReason='stall'`.
- No deload on increase.
- No history → `start`, `recommendedWeight = null`.
- `recommendedSets`: programmed → established(≥2 sessions) → default 3.
- Update the old "reps below floor → reduce" test to expect `hold`.

**Manual UI checklist:**
- Pre-fill weights to recommendation, reps blank, correct set count.
- First-time / bodyweight → weight blank.
- Check a set with blank reps → blocked.
- Clear reps on a checked set → reverts to incomplete.
- Edit Set 1 weight → Sets 2–3 unchanged.
- Deload-suggested → weight held; one-tap drop applies to weights only.
- Resume → values preserved.
- Finish → only sets with reps contribute to history/PRs.
- Regression spot-check: program launch, dashboard launch, discard, history.
