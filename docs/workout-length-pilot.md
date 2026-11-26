# Workout length — Muscle Gain pilot and review pack (4.3.9G)

**Status: PROPOSAL for owner review (2026-11-26).** Nothing here is applied. The logic
(`workout-duration.js`) is built and tested against fixtures but is not wired into any page. The
priorities below are proposed, stored nowhere, and need approval before they go into live Program data.

## How the estimate works

`estimate = warm-up + Σ exercises (sets × work time + rest between sets + one changeover)`

| Piece | Value | Notes |
|---|---|---|
| Warm-up | 5 / 6 / 7 / 8 min at 30 / 45 / 60 / 90 | general warm-up plus ramp-up sets |
| Rep-based set | 45 s | |
| Timed set (plank, carry) | its top time | `reps_high` seconds |
| Rest | the stored `rest_sec` | between sets only; essentials keep full rest |
| Changeover | 75 s per exercise | setup, plates, walking to the next station |

A built session may run at most 2 minutes over its length, and aims to land within 8 minutes under it.

**Rules the code enforces:** essentials are never removed or taken below their minimum sets; only `sets`
changes on a kept exercise (rep range, rest, notes and `exercise_id` never change); added work only uses
exercises already in the Program; today's length applies to one session and the next workout uses the
saved default; if essentials alone don't fit, the session is flagged (`fits: false`), never silently cut.
Progression and history key on `exercise_id`, so changing length cannot touch them (tested).

## Per-session priorities and results

### Upper A (today: ~66 min)

- **Essential:** Bench Press, Barbell Row (min sets: Bench Press 3, Barbell Row 3)
- **Trim order:** cut Plank → cut Face Pull → Bicep Curl to 2 → Tricep Pushdown to 2 → Dumbbell Shoulder Press to 2 → Lat Pulldown to 2 → cut Bicep Curl → cut Tricep Pushdown → Bench Press to 3 → Barbell Row to 3 → cut Dumbbell Shoulder Press → cut Lat Pulldown
- **Add order:** Bench Press to 5 sets → Barbell Row to 5 sets → add Incline Dumbbell Press 3×8–12 → add Lateral Raise 3×12–20 → add Hammer Curl 2×10–15 → add Overhead Tricep Extension 2×10–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 31 min | Bench Press 3, Barbell Row 3, Dumbbell Shoulder Press 2, Lat Pulldown 2 | −Plank; −Face Pull; Bicep Curl 3→2 sets; Tricep Pushdown 3→2 sets; Dumbbell Shoulder Press 3→2 sets; Lat Pulldown 3→2 sets; −Bicep Curl; −Tricep Pushdown; Bench Press 4→3 sets; Barbell Row 4→3 sets |
| 45 | 46 min | Bench Press 4, Barbell Row 4, Dumbbell Shoulder Press 2, Lat Pulldown 2, Bicep Curl 2, Tricep Pushdown 2 | −Plank; −Face Pull; Bicep Curl 3→2 sets; Tricep Pushdown 3→2 sets; Dumbbell Shoulder Press 3→2 sets; Lat Pulldown 3→2 sets |
| 60 | 60 min | Bench Press 4, Barbell Row 4, Dumbbell Shoulder Press 3, Lat Pulldown 3, Face Pull 3, Bicep Curl 3, Tricep Pushdown 3 | −Plank |
| 90 | 86 min | Bench Press 5, Barbell Row 5, Dumbbell Shoulder Press 3, Lat Pulldown 3, Face Pull 3, Bicep Curl 3, Tricep Pushdown 3, Plank 3, Incline Dumbbell Press 3, Lateral Raise 3 | Bench Press 4→5 sets; Barbell Row 4→5 sets; +Incline Dumbbell Press 3 sets; +Lateral Raise 3 sets |

### Upper B (today: ~57 min)

- **Essential:** Incline Dumbbell Press, Seated Cable Row (min sets: Incline Dumbbell Press 3, Seated Cable Row 3)
- **Trim order:** cut Plank → Hammer Curl to 2 → Overhead Tricep Extension to 2 → Lateral Raise to 2 → cut Hammer Curl → cut Overhead Tricep Extension → Lat Pulldown to 2 → Incline Dumbbell Press to 3 → Seated Cable Row to 3 → cut Lateral Raise → cut Lat Pulldown
- **Add order:** Incline Dumbbell Press to 5 sets → Lat Pulldown to 4 sets → add Cable Fly 3×12–15 → add Face Pull 3×15–20 → add Straight-Arm Pulldown 2×12–15 → Lateral Raise to 4 sets

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Incline Dumbbell Press 3, Seated Cable Row 4, Lat Pulldown 2, Lateral Raise 2 | −Plank; Hammer Curl 3→2 sets; Overhead Tricep Extension 3→2 sets; Lateral Raise 3→2 sets; −Hammer Curl; −Overhead Tricep Extension; Lat Pulldown 3→2 sets; Incline Dumbbell Press 4→3 sets |
| 45 | 46 min | Incline Dumbbell Press 4, Seated Cable Row 4, Lat Pulldown 3, Lateral Raise 3, Hammer Curl 2, Overhead Tricep Extension 2 | −Plank; Hammer Curl 3→2 sets; Overhead Tricep Extension 3→2 sets |
| 60 | 57 min | Incline Dumbbell Press 4, Seated Cable Row 4, Lat Pulldown 3, Lateral Raise 3, Hammer Curl 3, Overhead Tricep Extension 3, Plank 3 | none |
| 90 | 80 min ⚠ short of target | Incline Dumbbell Press 5, Seated Cable Row 4, Lat Pulldown 4, Lateral Raise 4, Hammer Curl 3, Overhead Tricep Extension 3, Plank 3, Cable Fly 3, Face Pull 3, Straight-Arm Pulldown 2 | Incline Dumbbell Press 4→5 sets; Lat Pulldown 3→4 sets; +Cable Fly 3 sets; +Face Pull 3 sets; +Straight-Arm Pulldown 2 sets; Lateral Raise 3→4 sets |

### Lower A (today: ~61 min)

- **Essential:** Barbell Back Squat, Romanian Deadlift (min sets: Barbell Back Squat 3, Romanian Deadlift 3)
- **Trim order:** cut Dead Bug → Standing Calf Raise to 2 → Leg Extension to 2 → Leg Curl to 2 → cut Leg Extension → Reverse Lunge to 2 → Romanian Deadlift to 3 → cut Standing Calf Raise → Barbell Back Squat to 3 → cut Reverse Lunge → cut Leg Curl
- **Add order:** Barbell Back Squat to 5 sets → add Hip Thrust 3×10–15 → Leg Curl to 4 sets → add Seated Calf Raise 3×12–20 → add Hanging Knee Raise 3×10–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Barbell Back Squat 3, Romanian Deadlift 3, Reverse Lunge 2, Leg Curl 2 | −Dead Bug; Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension; Reverse Lunge 3→2 sets; Romanian Deadlift 4→3 sets; −Standing Calf Raise; Barbell Back Squat 4→3 sets |
| 45 | 44 min | Barbell Back Squat 4, Romanian Deadlift 4, Reverse Lunge 3, Leg Curl 2, Standing Calf Raise 2 | −Dead Bug; Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension |
| 60 | 61 min | Barbell Back Squat 4, Romanian Deadlift 4, Reverse Lunge 3, Leg Curl 3, Leg Extension 3, Standing Calf Raise 4, Dead Bug 3 | none |
| 90 | 85 min | Barbell Back Squat 5, Romanian Deadlift 4, Reverse Lunge 3, Leg Curl 4, Leg Extension 3, Standing Calf Raise 4, Dead Bug 3, Hip Thrust 3, Seated Calf Raise 3, Hanging Knee Raise 3 | Barbell Back Squat 4→5 sets; +Hip Thrust 3 sets; Leg Curl 3→4 sets; +Seated Calf Raise 3 sets; +Hanging Knee Raise 3 sets |

### Lower B (today: ~56 min)

- **Essential:** Leg Press, Romanian Deadlift (min sets: Leg Press 3, Romanian Deadlift 3)
- **Trim order:** cut Hanging Knee Raise → Seated Calf Raise to 2 → Leg Curl to 2 → Hip Thrust to 2 → cut Seated Calf Raise → Bulgarian Split Squat to 2 → Leg Press to 3 → cut Leg Curl → cut Hip Thrust → cut Bulgarian Split Squat
- **Add order:** Leg Press to 5 sets → Romanian Deadlift to 4 sets → add Leg Extension 3×12–15 → add Standing Calf Raise 2×12–20 → add Dead Bug 3×10–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 32 min | Leg Press 3, Romanian Deadlift 3, Bulgarian Split Squat 2, Hip Thrust 2, Leg Curl 2 | −Hanging Knee Raise; Seated Calf Raise 4→2 sets; Leg Curl 3→2 sets; Hip Thrust 3→2 sets; −Seated Calf Raise; Bulgarian Split Squat 3→2 sets; Leg Press 4→3 sets |
| 45 | 46 min | Leg Press 4, Romanian Deadlift 3, Bulgarian Split Squat 3, Hip Thrust 3, Leg Curl 3, Seated Calf Raise 2 | −Hanging Knee Raise; Seated Calf Raise 4→2 sets |
| 60 | 56 min | Leg Press 4, Romanian Deadlift 3, Bulgarian Split Squat 3, Hip Thrust 3, Leg Curl 3, Seated Calf Raise 4, Hanging Knee Raise 3 | none |
| 90 | 77 min ⚠ short of target | Leg Press 5, Romanian Deadlift 4, Bulgarian Split Squat 3, Hip Thrust 3, Leg Curl 3, Seated Calf Raise 4, Hanging Knee Raise 3, Leg Extension 3, Standing Calf Raise 2, Dead Bug 3 | Leg Press 4→5 sets; Romanian Deadlift 3→4 sets; +Leg Extension 3 sets; +Standing Calf Raise 2 sets; +Dead Bug 3 sets |

### Push (A/B) (today: ~54 min)

- **Essential:** Bench Press, Overhead Press (min sets: Bench Press 3, Overhead Press 2)
- **Trim order:** cut Plank → cut Overhead Tricep Extension → Cable Fly to 2 → Tricep Pushdown to 2 → Lateral Raise to 2 → cut Cable Fly → Bench Press to 3 → cut Tricep Pushdown → Overhead Press to 2 → cut Lateral Raise
- **Add order:** Bench Press to 5 sets → add Incline Dumbbell Press 3×8–12 → Lateral Raise to 4 sets → Overhead Tricep Extension to 3 sets → add Dumbbell Shoulder Press 2×8–12

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Bench Press 3, Overhead Press 3, Lateral Raise 2, Tricep Pushdown 2 | −Plank; −Overhead Tricep Extension; Cable Fly 3→2 sets; Tricep Pushdown 3→2 sets; Lateral Raise 3→2 sets; −Cable Fly; Bench Press 4→3 sets |
| 45 | 47 min | Bench Press 4, Overhead Press 3, Lateral Raise 3, Cable Fly 3, Tricep Pushdown 3, Overhead Tricep Extension 2 | −Plank |
| 60 | 54 min | Bench Press 4, Overhead Press 3, Lateral Raise 3, Cable Fly 3, Tricep Pushdown 3, Overhead Tricep Extension 2, Plank 3 | none |
| 90 | 73 min ⚠ short of target | Bench Press 5, Overhead Press 3, Lateral Raise 4, Cable Fly 3, Tricep Pushdown 3, Overhead Tricep Extension 3, Plank 3, Incline Dumbbell Press 3, Dumbbell Shoulder Press 2 | Bench Press 4→5 sets; +Incline Dumbbell Press 3 sets; Lateral Raise 3→4 sets; Overhead Tricep Extension 2→3 sets; +Dumbbell Shoulder Press 2 sets |

### Pull (A/B) (today: ~53 min)

- **Essential:** Lat Pulldown, Barbell Row (min sets: Lat Pulldown 3, Barbell Row 3)
- **Trim order:** cut Hanging Knee Raise → cut Hammer Curl → Straight-Arm Pulldown to 2 → Face Pull to 2 → Barbell Curl to 2 → cut Straight-Arm Pulldown → Barbell Row to 3 → Lat Pulldown to 3 → cut Barbell Curl → cut Face Pull
- **Add order:** Barbell Row to 5 sets → add Seated Cable Row 3×8–12 → Hammer Curl to 3 sets → Face Pull to 4 sets → add Bicep Curl 2×12–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Lat Pulldown 4, Barbell Row 3, Face Pull 2, Barbell Curl 2 | −Hanging Knee Raise; −Hammer Curl; Straight-Arm Pulldown 3→2 sets; Face Pull 3→2 sets; Barbell Curl 3→2 sets; −Straight-Arm Pulldown; Barbell Row 4→3 sets |
| 45 | 47 min | Lat Pulldown 4, Barbell Row 4, Face Pull 3, Straight-Arm Pulldown 3, Barbell Curl 3, Hammer Curl 2 | −Hanging Knee Raise |
| 60 | 53 min | Lat Pulldown 4, Barbell Row 4, Face Pull 3, Straight-Arm Pulldown 3, Barbell Curl 3, Hammer Curl 2, Hanging Knee Raise 3 | none |
| 90 | 71 min ⚠ short of target | Lat Pulldown 4, Barbell Row 5, Face Pull 4, Straight-Arm Pulldown 3, Barbell Curl 3, Hammer Curl 3, Hanging Knee Raise 3, Seated Cable Row 3, Bicep Curl 2 | Barbell Row 4→5 sets; +Seated Cable Row 3 sets; Hammer Curl 2→3 sets; Face Pull 3→4 sets; +Bicep Curl 2 sets |

### Legs (A/B) (today: ~58 min)

- **Essential:** Barbell Back Squat, Romanian Deadlift (min sets: Barbell Back Squat 3, Romanian Deadlift 2)
- **Trim order:** cut Dead Bug → Standing Calf Raise to 2 → Leg Extension to 2 → Leg Curl to 2 → cut Leg Extension → Bulgarian Split Squat to 2 → Barbell Back Squat to 3 → cut Standing Calf Raise → Romanian Deadlift to 2 → cut Bulgarian Split Squat → cut Leg Curl
- **Add order:** Barbell Back Squat to 5 sets → add Hip Thrust 3×10–15 → Romanian Deadlift to 4 sets → add Seated Calf Raise 3×12–20 → add Hanging Knee Raise 3×10–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Barbell Back Squat 3, Romanian Deadlift 3, Bulgarian Split Squat 2, Leg Curl 2 | −Dead Bug; Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension; Bulgarian Split Squat 3→2 sets; Barbell Back Squat 4→3 sets; −Standing Calf Raise |
| 45 | 46 min | Barbell Back Squat 4, Romanian Deadlift 3, Bulgarian Split Squat 3, Leg Curl 3, Leg Extension 2, Standing Calf Raise 2 | −Dead Bug; Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets |
| 60 | 58 min | Barbell Back Squat 4, Romanian Deadlift 3, Bulgarian Split Squat 3, Leg Curl 3, Leg Extension 3, Standing Calf Raise 4, Dead Bug 3 | none |
| 90 | 83 min | Barbell Back Squat 5, Romanian Deadlift 4, Bulgarian Split Squat 3, Leg Curl 3, Leg Extension 3, Standing Calf Raise 4, Dead Bug 3, Hip Thrust 3, Seated Calf Raise 3, Hanging Knee Raise 3 | Barbell Back Squat 4→5 sets; +Hip Thrust 3 sets; Romanian Deadlift 3→4 sets; +Seated Calf Raise 3 sets; +Hanging Knee Raise 3 sets |

### Full Body A (today: ~66 min)

- **Essential:** Barbell Back Squat, Bench Press, Barbell Row (min sets: Barbell Back Squat 3, Bench Press 3, Barbell Row 3)
- **Trim order:** cut Plank → Bicep Curl to 2 → Tricep Pushdown to 2 → Romanian Deadlift to 2 → cut Bicep Curl → cut Tricep Pushdown → Barbell Back Squat to 3 → Bench Press to 3 → Barbell Row to 3 → cut Romanian Deadlift
- **Add order:** add Lat Pulldown 3×8–12 → add Lateral Raise 3×12–20 → Romanian Deadlift to 4 sets → add Standing Calf Raise 3×12–20 → Bicep Curl to 4 sets

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 31 min | Barbell Back Squat 3, Bench Press 3, Barbell Row 3 | −Plank; Bicep Curl 3→2 sets; Tricep Pushdown 3→2 sets; Romanian Deadlift 3→2 sets; −Bicep Curl; −Tricep Pushdown; Barbell Back Squat 4→3 sets; Bench Press 4→3 sets; Barbell Row 4→3 sets; −Romanian Deadlift |
| 45 | 46 min | Barbell Back Squat 4, Bench Press 4, Barbell Row 4, Romanian Deadlift 2 | −Plank; Bicep Curl 3→2 sets; Tricep Pushdown 3→2 sets; Romanian Deadlift 3→2 sets; −Bicep Curl; −Tricep Pushdown |
| 60 | 60 min | Barbell Back Squat 4, Bench Press 4, Barbell Row 4, Romanian Deadlift 3, Bicep Curl 3, Tricep Pushdown 3 | −Plank |
| 90 | 87 min | Barbell Back Squat 4, Bench Press 4, Barbell Row 4, Romanian Deadlift 4, Bicep Curl 3, Tricep Pushdown 3, Plank 3, Lat Pulldown 3, Lateral Raise 3, Standing Calf Raise 3 | +Lat Pulldown 3 sets; +Lateral Raise 3 sets; Romanian Deadlift 3→4 sets; +Standing Calf Raise 3 sets |

### Full Body B (today: ~46 min)

- **Essential:** Bulgarian Split Squat, Overhead Press, Lat Pulldown (min sets: Bulgarian Split Squat 2, Overhead Press 3, Lat Pulldown 3)
- **Trim order:** cut Dead Bug → Lateral Raise to 2 → Romanian Deadlift to 2 → cut Lateral Raise → Bulgarian Split Squat to 2 → cut Romanian Deadlift
- **Add order:** add Barbell Row 3×6–10 → add Incline Dumbbell Press 3×8–12 → add Hammer Curl 3×10–15 → add Overhead Tricep Extension 3×10–15 → Romanian Deadlift to 4 sets → add Standing Calf Raise 3×12–20 → Lateral Raise to 4 sets

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 31 min | Bulgarian Split Squat 3, Overhead Press 3, Lat Pulldown 3, Romanian Deadlift 2 | −Dead Bug; Lateral Raise 3→2 sets; Romanian Deadlift 3→2 sets; −Lateral Raise |
| 45 | 45 min | Bulgarian Split Squat 3, Overhead Press 3, Lat Pulldown 3, Romanian Deadlift 3, Lateral Raise 3, Dead Bug 3 | none |
| 60 | 54 min | Bulgarian Split Squat 3, Overhead Press 3, Lat Pulldown 3, Romanian Deadlift 3, Lateral Raise 3, Dead Bug 3, Barbell Row 3 | +Barbell Row 3 sets |
| 90 | 82 min ⚠ short of target | Bulgarian Split Squat 3, Overhead Press 3, Lat Pulldown 3, Romanian Deadlift 4, Lateral Raise 4, Dead Bug 3, Barbell Row 3, Incline Dumbbell Press 3, Hammer Curl 3, Overhead Tricep Extension 3, Standing Calf Raise 3 | +Barbell Row 3 sets; +Incline Dumbbell Press 3 sets; +Hammer Curl 3 sets; +Overhead Tricep Extension 3 sets; Romanian Deadlift 3→4 sets; +Standing Calf Raise 3 sets; Lateral Raise 3→4 sets |

### Full Body C (today: ~44 min)

- **Essential:** Leg Press, Incline Dumbbell Press, Seated Cable Row (min sets: Leg Press 3, Incline Dumbbell Press 3, Seated Cable Row 3)
- **Trim order:** cut Farmer Carry → Face Pull to 2 → Leg Curl to 2 → cut Face Pull → cut Leg Curl
- **Add order:** add Romanian Deadlift 3×8–12 → add Lat Pulldown 3×8–12 → add Bicep Curl 3×10–15 → add Tricep Pushdown 3×10–15 → add Lateral Raise 3×12–20 → Leg Press to 4 sets

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 29 min | Leg Press 3, Incline Dumbbell Press 3, Seated Cable Row 3, Leg Curl 2 | −Farmer Carry; Face Pull 3→2 sets; Leg Curl 3→2 sets; −Face Pull |
| 45 | 43 min | Leg Press 3, Incline Dumbbell Press 3, Seated Cable Row 3, Face Pull 3, Leg Curl 3, Farmer Carry 3 | none |
| 60 | 57 min | Leg Press 3, Incline Dumbbell Press 3, Seated Cable Row 3, Face Pull 3, Leg Curl 3, Farmer Carry 3, Romanian Deadlift 3, Lat Pulldown 3 | +Romanian Deadlift 3 sets; +Lat Pulldown 3 sets |
| 90 | 77 min ⚠ short of target | Leg Press 4, Incline Dumbbell Press 3, Seated Cable Row 3, Face Pull 3, Leg Curl 3, Farmer Carry 3, Romanian Deadlift 3, Lat Pulldown 3, Bicep Curl 3, Tricep Pushdown 3, Lateral Raise 3 | +Romanian Deadlift 3 sets; +Lat Pulldown 3 sets; +Bicep Curl 3 sets; +Tricep Pushdown 3 sets; +Lateral Raise 3 sets; Leg Press 3→4 sets |

## Weekly check, every supported day count

Estimates per session in schedule order (minutes). Every session at every day count fits 30, 45 and 60.

| Days | Sessions | 30 | 45 | 60 | 90 |
|---|---|---|---|---|---|
| 2 | full_a, full_b | 31 / 31 | 46 / 45 | 60 / 54 | 87 / 82 |
| 3 | full_a, full_b, full_c | 31 / 31 / 29 | 46 / 45 / 43 | 60 / 54 / 57 | 87 / 82 / 77 |
| 4 | upper_a, lower_a, upper_b, lower_b | 31 / 30 / 30 / 32 | 46 / 44 / 46 / 46 | 60 / 61 / 57 / 56 | 86 / 85 / 80 / 77 |
| 5 | push_a, pull_a, legs_a, upper_b, lower_b | 30 / 30 / 30 / 30 / 32 | 47 / 47 / 46 / 46 / 46 | 54 / 53 / 58 / 57 / 56 | 73 / 71 / 83 / 80 / 77 |
| 6 | push_a, pull_a, legs_a, push_b, pull_b, legs_b | 30 / 30 / 30 / 30 / 30 / 30 | 47 / 47 / 46 / 47 / 47 / 46 | 54 / 53 / 58 / 54 / 53 / 58 | 73 / 71 / 83 / 73 / 71 / 83 |

**What the week loses at short lengths.** No essential lift is ever dropped. At **30 min**, core work,
calves and arm isolation disappear across the whole week at every day count. At **45 min**, core work
(plank, dead bug, knee raise) mostly disappears, and on 4 days also leg extension and face pull. At 60 min
only one plank goes on 2–3 days. See decision 2.

## Decisions for you

1. **What fills a 90-minute Muscle Gain session?** With purposeful lifting only (extra main-lift sets and
   accessories already in the Program), sessions reach 77–87 min, but Push and Pull stop at about 71–73 min.
   Options: (a) accept ~75–85 min as the 90 option; (b) add more accessory sets (risk of junk volume);
   (c) add an optional 10–15 min easy conditioning block (bike or incline walk) where lifting runs out.
   **I recommend (c) for Push and Pull only.**
2. **Short-session coverage.** At 30 min core, calves and arm isolation drop for the whole week.
   **I recommend accepting that at 30 min** (main lifts matter most when time is tight), and at 45 min
   keeping one core exercise per week by moving core to the front of one session's trim list.
3. **Muscle Gain Push/Pull/Legs A and B are identical in the live data.** A 6-day user does the same three
   workouts twice a week. **I recommend writing distinct B versions** (for example incline and dumbbell
   variations on Push B, chest-supported and cable variations on Pull B, leg press and hip thrust lead
   on Legs B). That's a content change, and needs your approval.
4. **Approve the per-session priorities** above (essentials, trim order, add order) or tell me what to
   change. Rep ranges are untouched.
5. **Approve the flows and the migration** below.

## Proposed flows

**Onboarding.** New question right after "Days per week": *"How long do you usually want to train?"*
with four large options: 30 min · 45 min · 60 min · 90 min. No default is preselected; the answer joins the
onboarding draft and is claimed into the profile with the other answers.

**Existing users.** Anyone without a saved length is treated as 60 min (the length today's sessions were
designed around), so nothing changes for them. Train shows a one-time card: *"How long do you usually
train? Set it once and every workout fits your time."* → opens the Profile setting. Dismissing it keeps 60.

**Profile.** New row *"Usual workout length — 60 min"* next to Equipment and Training days. Tapping it opens
the same edit sheet pattern as Equipment (`profile.html?edit=length`) and saves only that field.

**Train.** On the next-workout card, a row of four chips (30 · 45 · 60 · 90) with the usual length
preselected. Changing it updates the preview right away: exercise list with sets and the estimate
("About 46 min"), plus a short line on what changed ("Shortened: skipped Plank and Face Pull, curls 2
sets"). Start workout uses that version. The choice isn't saved; the next workout starts on the usual
length again. Finish early already works through the normal Finish button. If the essentials don't fit,
the preview says so ("This one needs about 38 min — we kept the main lifts") and the week is flagged.

## Proposed migration (NOT applied)

```sql
-- 4.3.9G: usual workout length and per-session length plans
alter table public.profiles
  add column workout_minutes smallint
  check (workout_minutes is null or workout_minutes in (30, 45, 60, 90));

-- Per Program session: essentials, min sets, trim and add lists (shape as in
-- benchmarks/muscle-gain-duration-fixtures.js). Null = session not yet planned,
-- and the app then shows it at its stored length with no length chips.
alter table public.program_routines
  add column length_plan jsonb;

-- Optional, for the Coach later: the length chosen for a logged workout.
-- alter table public.workouts add column planned_minutes smallint
--   check (planned_minutes is null or planned_minutes in (30, 45, 60, 90));
```

RLS needs no change: `profiles` already limits users to their own row, and `program_routines` is
read-only catalog data.

## Weekly schedule review — Advanced Muscle, Advanced Home Strength, Home Fat Loss

**Finding:** Advanced Muscle and Advanced Home Strength already have Full Body A/B/C and Push/Pull/Legs
A/B sessions written in the database, but `schedules.js` maps every day count to the same Upper/Lower
four. The fix is mostly the mapping, not new content.

| Program | Days | Today | Proposed | Why |
|---|---|---|---|---|
| Advanced Muscle | 2 | Upper A, Lower A, Upper B, Lower B (rotating) | Full Body A, Full Body B | each week trains everything twice instead of each muscle once every two weeks |
| | 3 | same four | Full Body A, B, C | full body 3× is the standard for 3 days |
| | 4 | Upper A, Lower A, Upper B, Lower B | unchanged | already right |
| | 5 | same four | Pull A, Push A, Legs A, Upper B, Legs B | deadlift once (Pull A), squat and hack squat on separate days, Lower B left out so deadlifts don't stack |
| | 6 | same four | Pull A, Push A, Legs A, Pull B, Push B, Legs B | deadlift day sits two days from squat day |
| Advanced Home Strength (draft) | 2 / 3 / 4 | same four | Full Body A, B / A, B, C / Upper-Lower unchanged | same reasons |
| | 5 / 6 | same four | Push A, Pull A, Legs A, Upper B, Lower B / Push, Pull, Legs A and B | no heavy hinge to space, so the Muscle Gain order works |
| Home Fat Loss (not built) | 2–6 | same four for every count | 2: Full A, Full B · 3: Full A, Conditioning A, Full B · 4: Upper/Lower · 5: Upper/Lower + Conditioning A · 6: + Conditioning B | sessions still need writing when the Program is built |

Changing Advanced Muscle's mapping changes live workouts for its users (it's published), so it needs your
approval. Existing users keep their history; their next session follows the new order.

**Also noticed:** Bodyweight Fat Loss runs the same four sessions at 4, 5 and 6 days, and its 3-day list
rotates six entries across two weeks. It should get the same review before its duration rollout.

## Rollout tracker

Status per Program and day count. ✓ = all four lengths validated · ◐ = validated with a decision pending
· — = not started · ✗ = schedule fix needed first.

| Program | 2 | 3 | 4 | 5 | 6 | Note |
|---|---|---|---|---|---|---|
| Muscle Gain (pilot) | ◐ | ◐ | ◐ | ◐ | ◐ | 30/45/60 pass; 90 short (decision 1); identical A/B (decision 3) |
| 90-Day Fat Loss Blueprint | — | — | — | — | — | |
| Glute Builder | — | — | — | — | — | |
| Home Strength | — | — | — | — | — | |
| Bodyweight Foundations | — | — | — | — | — | |
| Bodyweight Fat Loss | — | — | ✗ | ✗ | ✗ | same four at 4–6 days |
| Advanced Muscle | ✗ | ✗ | — | ✗ | ✗ | schedule fix proposed above |
| Advanced Fat Loss | — | — | — | — | — | |
| Advanced Home Strength | ✗ | ✗ | — | ✗ | ✗ | schedule fix proposed above |
| Home Fat Loss | ✗ | ✗ | ✗ | ✗ | ✗ | not built yet |
