# Workout length — Muscle Gain pilot and review pack (4.3.9G)

**Status (2026-11-26):** priorities, flows and migration **approved and applied**. The usual length is
asked in onboarding and editable in Profile; Train shows the length chips and live preview for every
session with a stored plan. Live Muscle Gain sessions have their plans stored, except Push B, Pull B and
Legs B, whose new content (below) **still needs your OK** before it replaces today's copies of A.

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
exercises already in the Program (plus the approved optional easy walk); today's length applies to one session and the next workout uses the
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
- **Trim order:** Standing Calf Raise to 2 → Leg Extension to 2 → Leg Curl to 2 → cut Leg Extension → Reverse Lunge to 2 → Romanian Deadlift to 3 → cut Standing Calf Raise → Dead Bug to 2 → Barbell Back Squat to 3 → cut Reverse Lunge → cut Leg Curl → cut Dead Bug
- **Add order:** Barbell Back Squat to 5 sets → add Hip Thrust 3×10–15 → Leg Curl to 4 sets → add Seated Calf Raise 3×12–20 → add Hanging Knee Raise 3×10–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Barbell Back Squat 3, Romanian Deadlift 3, Leg Curl 2, Dead Bug 2 | Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension; Reverse Lunge 3→2 sets; Romanian Deadlift 4→3 sets; −Standing Calf Raise; Dead Bug 3→2 sets; Barbell Back Squat 4→3 sets; −Reverse Lunge |
| 45 | 47 min | Barbell Back Squat 4, Romanian Deadlift 4, Reverse Lunge 2, Leg Curl 2, Standing Calf Raise 2, Dead Bug 3 | Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension; Reverse Lunge 3→2 sets |
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

### Push A (also the legacy Push) (today: ~54 min)

- **Essential:** Bench Press, Overhead Press (min sets: Bench Press 3, Overhead Press 2)
- **Trim order:** cut Plank → cut Overhead Tricep Extension → Cable Fly to 2 → Tricep Pushdown to 2 → Lateral Raise to 2 → cut Cable Fly → Bench Press to 3 → cut Tricep Pushdown → Overhead Press to 2 → cut Lateral Raise
- **Add order:** Bench Press to 5 sets → add Incline Dumbbell Press 3×8–12 → Lateral Raise to 4 sets → Overhead Tricep Extension to 3 sets → add Dumbbell Shoulder Press 2×8–12 → add Incline Treadmill Walk 1×600–900

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Bench Press 3, Overhead Press 3, Lateral Raise 2, Tricep Pushdown 2 | −Plank; −Overhead Tricep Extension; Cable Fly 3→2 sets; Tricep Pushdown 3→2 sets; Lateral Raise 3→2 sets; −Cable Fly; Bench Press 4→3 sets |
| 45 | 47 min | Bench Press 4, Overhead Press 3, Lateral Raise 3, Cable Fly 3, Tricep Pushdown 3, Overhead Tricep Extension 2 | −Plank |
| 60 | 54 min | Bench Press 4, Overhead Press 3, Lateral Raise 3, Cable Fly 3, Tricep Pushdown 3, Overhead Tricep Extension 2, Plank 3 | none |
| 90 | 90 min | Bench Press 5, Overhead Press 3, Lateral Raise 4, Cable Fly 3, Tricep Pushdown 3, Overhead Tricep Extension 3, Plank 3, Incline Dumbbell Press 3, Dumbbell Shoulder Press 2, Incline Treadmill Walk 1 | Bench Press 4→5 sets; +Incline Dumbbell Press 3 sets; Lateral Raise 3→4 sets; Overhead Tricep Extension 2→3 sets; +Dumbbell Shoulder Press 2 sets; +Incline Treadmill Walk 1 sets |

### Pull A (also the legacy Pull) (today: ~53 min)

- **Essential:** Lat Pulldown, Barbell Row (min sets: Lat Pulldown 3, Barbell Row 3)
- **Trim order:** cut Hanging Knee Raise → cut Hammer Curl → Straight-Arm Pulldown to 2 → Face Pull to 2 → Barbell Curl to 2 → cut Straight-Arm Pulldown → Barbell Row to 3 → Lat Pulldown to 3 → cut Barbell Curl → cut Face Pull
- **Add order:** Barbell Row to 5 sets → add Seated Cable Row 3×8–12 → Hammer Curl to 3 sets → Face Pull to 4 sets → add Bicep Curl 2×12–15 → add Incline Treadmill Walk 1×600–900

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Lat Pulldown 4, Barbell Row 3, Face Pull 2, Barbell Curl 2 | −Hanging Knee Raise; −Hammer Curl; Straight-Arm Pulldown 3→2 sets; Face Pull 3→2 sets; Barbell Curl 3→2 sets; −Straight-Arm Pulldown; Barbell Row 4→3 sets |
| 45 | 47 min | Lat Pulldown 4, Barbell Row 4, Face Pull 3, Straight-Arm Pulldown 3, Barbell Curl 3, Hammer Curl 2 | −Hanging Knee Raise |
| 60 | 53 min | Lat Pulldown 4, Barbell Row 4, Face Pull 3, Straight-Arm Pulldown 3, Barbell Curl 3, Hammer Curl 2, Hanging Knee Raise 3 | none |
| 90 | 87 min | Lat Pulldown 4, Barbell Row 5, Face Pull 4, Straight-Arm Pulldown 3, Barbell Curl 3, Hammer Curl 3, Hanging Knee Raise 3, Seated Cable Row 3, Bicep Curl 2, Incline Treadmill Walk 1 | Barbell Row 4→5 sets; +Seated Cable Row 3 sets; Hammer Curl 2→3 sets; Face Pull 3→4 sets; +Bicep Curl 2 sets; +Incline Treadmill Walk 1 sets |

### Legs A (also the legacy Legs) (today: ~58 min)

- **Essential:** Barbell Back Squat, Romanian Deadlift (min sets: Barbell Back Squat 3, Romanian Deadlift 2)
- **Trim order:** Standing Calf Raise to 2 → Leg Extension to 2 → Leg Curl to 2 → cut Leg Extension → Bulgarian Split Squat to 2 → Barbell Back Squat to 3 → cut Standing Calf Raise → Dead Bug to 2 → Romanian Deadlift to 2 → cut Bulgarian Split Squat → cut Leg Curl → cut Dead Bug
- **Add order:** Barbell Back Squat to 5 sets → add Hip Thrust 3×10–15 → Romanian Deadlift to 4 sets → add Seated Calf Raise 3×12–20 → add Hanging Knee Raise 3×10–15

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 31 min | Barbell Back Squat 3, Romanian Deadlift 2, Bulgarian Split Squat 2, Leg Curl 2, Dead Bug 2 | Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension; Bulgarian Split Squat 3→2 sets; Barbell Back Squat 4→3 sets; −Standing Calf Raise; Dead Bug 3→2 sets; Romanian Deadlift 3→2 sets |
| 45 | 46 min | Barbell Back Squat 4, Romanian Deadlift 3, Bulgarian Split Squat 3, Leg Curl 2, Standing Calf Raise 2, Dead Bug 3 | Standing Calf Raise 4→2 sets; Leg Extension 3→2 sets; Leg Curl 3→2 sets; −Leg Extension |
| 60 | 58 min | Barbell Back Squat 4, Romanian Deadlift 3, Bulgarian Split Squat 3, Leg Curl 3, Leg Extension 3, Standing Calf Raise 4, Dead Bug 3 | none |
| 90 | 83 min | Barbell Back Squat 5, Romanian Deadlift 4, Bulgarian Split Squat 3, Leg Curl 3, Leg Extension 3, Standing Calf Raise 4, Dead Bug 3, Hip Thrust 3, Seated Calf Raise 3, Hanging Knee Raise 3 | Barbell Back Squat 4→5 sets; +Hip Thrust 3 sets; Romanian Deadlift 3→4 sets; +Seated Calf Raise 3 sets; +Hanging Knee Raise 3 sets |

### Push B — NEW, pending your OK (today: ~51 min)

- **Essential:** Incline Bench Press, Machine Shoulder Press (min sets: Incline Bench Press 3, Machine Shoulder Press 2)
- **Trim order:** cut Cable Crunch → cut Overhead Cable Triceps Extension → Pec Deck to 2 → Rope Pushdown to 2 → Cable Lateral Raise to 2 → cut Pec Deck → Incline Bench Press to 3 → cut Rope Pushdown → Machine Shoulder Press to 2 → cut Cable Lateral Raise
- **Add order:** Incline Bench Press to 5 sets → add Close-Grip Bench Press 3×8–12 → Cable Lateral Raise to 4 sets → Overhead Cable Triceps Extension to 3 sets → Pec Deck to 4 sets → add Incline Treadmill Walk 1×600–900

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 31 min | Incline Bench Press 4, Machine Shoulder Press 3, Cable Lateral Raise 2, Rope Pushdown 2 | −Cable Crunch; −Overhead Cable Triceps Extension; Pec Deck 3→2 sets; Rope Pushdown 3→2 sets; Cable Lateral Raise 3→2 sets; −Pec Deck |
| 45 | 45 min | Incline Bench Press 4, Machine Shoulder Press 3, Pec Deck 3, Cable Lateral Raise 3, Rope Pushdown 3, Overhead Cable Triceps Extension 2 | −Cable Crunch |
| 60 | 54 min | Incline Bench Press 5, Machine Shoulder Press 3, Pec Deck 3, Cable Lateral Raise 3, Rope Pushdown 3, Overhead Cable Triceps Extension 2, Cable Crunch 3 | Incline Bench Press 4→5 sets |
| 90 | 83 min | Incline Bench Press 5, Machine Shoulder Press 3, Pec Deck 4, Cable Lateral Raise 4, Rope Pushdown 3, Overhead Cable Triceps Extension 3, Cable Crunch 3, Close-Grip Bench Press 3, Incline Treadmill Walk 1 | Incline Bench Press 4→5 sets; +Close-Grip Bench Press 3 sets; Cable Lateral Raise 3→4 sets; Overhead Cable Triceps Extension 2→3 sets; Pec Deck 3→4 sets; +Incline Treadmill Walk 1 sets |

### Pull B — NEW, pending your OK (today: ~53 min)

- **Essential:** Neutral-Grip Lat Pulldown, Chest-Supported Row (min sets: Neutral-Grip Lat Pulldown 3, Chest-Supported Row 3)
- **Trim order:** cut Hanging Leg Raise → cut Cable Curl → Single-Arm Cable Row to 2 → Reverse Pec Deck to 2 → Incline Dumbbell Curl to 2 → cut Single-Arm Cable Row → Chest-Supported Row to 3 → Neutral-Grip Lat Pulldown to 3 → cut Incline Dumbbell Curl → cut Reverse Pec Deck
- **Add order:** Chest-Supported Row to 5 sets → add Dumbbell Row 3×8–12 → Cable Curl to 3 sets → Reverse Pec Deck to 4 sets → add Incline Treadmill Walk 1×600–900

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 30 min | Neutral-Grip Lat Pulldown 4, Chest-Supported Row 3, Reverse Pec Deck 2, Incline Dumbbell Curl 2 | −Hanging Leg Raise; −Cable Curl; Single-Arm Cable Row 3→2 sets; Reverse Pec Deck 3→2 sets; Incline Dumbbell Curl 3→2 sets; −Single-Arm Cable Row; Chest-Supported Row 4→3 sets |
| 45 | 47 min | Neutral-Grip Lat Pulldown 4, Chest-Supported Row 4, Single-Arm Cable Row 3, Reverse Pec Deck 3, Incline Dumbbell Curl 3, Cable Curl 2 | −Hanging Leg Raise |
| 60 | 53 min | Neutral-Grip Lat Pulldown 4, Chest-Supported Row 4, Single-Arm Cable Row 3, Reverse Pec Deck 3, Incline Dumbbell Curl 3, Cable Curl 2, Hanging Leg Raise 3 | none |
| 90 | 83 min | Neutral-Grip Lat Pulldown 4, Chest-Supported Row 5, Single-Arm Cable Row 3, Reverse Pec Deck 4, Incline Dumbbell Curl 3, Cable Curl 3, Hanging Leg Raise 3, Dumbbell Row 3, Incline Treadmill Walk 1 | Chest-Supported Row 4→5 sets; +Dumbbell Row 3 sets; Cable Curl 2→3 sets; Reverse Pec Deck 3→4 sets; +Incline Treadmill Walk 1 sets |

### Legs B — NEW, pending your OK (today: ~59 min)

- **Essential:** Hack Squat, Hip Thrust (min sets: Hack Squat 3, Hip Thrust 3)
- **Trim order:** cut Hanging Knee Raise → Seated Calf Raise to 2 → Leg Extension to 2 → Seated Leg Curl to 2 → cut Leg Extension → Walking Lunge to 2 → Hack Squat to 3 → cut Seated Calf Raise → Hip Thrust to 3 → cut Walking Lunge → cut Seated Leg Curl
- **Add order:** Hack Squat to 5 sets → add Leg Press 3×10–15 → Seated Leg Curl to 4 sets → add Dead Bug 3×10–15 → Walking Lunge to 4 sets → Hip Thrust to 5 sets

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 32 min | Hack Squat 3, Hip Thrust 4, Walking Lunge 2, Seated Leg Curl 2 | −Hanging Knee Raise; Seated Calf Raise 4→2 sets; Leg Extension 3→2 sets; Seated Leg Curl 3→2 sets; −Leg Extension; Walking Lunge 3→2 sets; Hack Squat 4→3 sets; −Seated Calf Raise |
| 45 | 46 min | Hack Squat 4, Hip Thrust 4, Walking Lunge 3, Seated Leg Curl 2, Leg Extension 2, Seated Calf Raise 2 | −Hanging Knee Raise; Seated Calf Raise 4→2 sets; Leg Extension 3→2 sets; Seated Leg Curl 3→2 sets |
| 60 | 59 min | Hack Squat 4, Hip Thrust 4, Walking Lunge 3, Seated Leg Curl 3, Leg Extension 3, Seated Calf Raise 4, Hanging Knee Raise 3 | none |
| 90 | 83 min | Hack Squat 5, Hip Thrust 5, Walking Lunge 4, Seated Leg Curl 4, Leg Extension 3, Seated Calf Raise 4, Hanging Knee Raise 3, Leg Press 3, Dead Bug 3 | Hack Squat 4→5 sets; +Leg Press 3 sets; Seated Leg Curl 3→4 sets; +Dead Bug 3 sets; Walking Lunge 3→4 sets; Hip Thrust 4→5 sets |

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
- **Trim order:** Lateral Raise to 2 → Romanian Deadlift to 2 → cut Lateral Raise → Dead Bug to 2 → Bulgarian Split Squat to 2 → cut Romanian Deadlift → cut Dead Bug
- **Add order:** add Barbell Row 3×6–10 → add Incline Dumbbell Press 3×8–12 → add Hammer Curl 3×10–15 → add Overhead Tricep Extension 3×10–15 → Romanian Deadlift to 4 sets → add Standing Calf Raise 3×12–20 → Lateral Raise to 4 sets

| Length | Estimate | Exercises | What changed |
|---|---|---|---|
| 30 | 32 min | Bulgarian Split Squat 2, Overhead Press 3, Lat Pulldown 3, Romanian Deadlift 2, Dead Bug 2 | Lateral Raise 3→2 sets; Romanian Deadlift 3→2 sets; −Lateral Raise; Dead Bug 3→2 sets; Bulgarian Split Squat 3→2 sets |
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

Estimates per session in schedule order (minutes). Every session at every day count fits 30, 45 and 60,
and every 45-minute week keeps at least one core exercise.

| Days | Sessions | 30 | 45 | 60 | 90 |
|---|---|---|---|---|---|
| 2 | full_a, full_b | 31 / 32 | 46 / 45 | 60 / 54 | 87 / 82 |
| 3 | full_a, full_b, full_c | 31 / 32 / 29 | 46 / 45 / 43 | 60 / 54 / 57 | 87 / 82 / 77 |
| 4 | upper_a, lower_a, upper_b, lower_b | 31 / 30 / 30 / 32 | 46 / 47 / 46 / 46 | 60 / 61 / 57 / 56 | 86 / 85 / 80 / 77 |
| 5 | push_a, pull_a, legs_a, upper_b, lower_b | 30 / 30 / 31 / 30 / 32 | 47 / 47 / 46 / 46 / 46 | 54 / 53 / 58 / 57 / 56 | 90 / 87 / 83 / 80 / 77 |
| 6 | push_a, pull_a, legs_a, push_b, pull_b, legs_b | 30 / 30 / 31 / 31 / 30 / 32 | 47 / 47 / 46 / 45 / 47 / 46 | 54 / 53 / 58 / 54 / 53 / 59 | 90 / 87 / 83 / 83 / 83 / 83 |

At 90 minutes, Push and Pull now reach about 87–90 with the optional walk. Upper B, Lower B and Full
Body C land at about 77–80 using lifting only, which is the accepted result for the 90 option.

## Decisions (owner-approved 2026-11-26)

1. **90-minute Push and Pull** end with an optional easy Incline Treadmill Walk, 10–15 min at a pace you
   can talk at. It shortens itself to fit and never appears below 90 minutes.
2. **Short-session coverage:** at 30 minutes core, calves and arm isolation may drop for the week. At 45,
   Dead Bug is cut last on Full Body B, Lower A and Legs A, so every 45-minute week keeps one core exercise.
3. **Distinct Push, Pull and Legs B** — content below, waiting for your OK.
4. **Per-session priorities** as listed above — stored for 13 live sessions (migration `20261126182616`).
5. **Flows and migration** — built as below; columns added by migration `20261126182055`.

## Push B, Pull B and Legs B — new content (needs your OK)

Today these are exact copies of Push A, Pull A and Legs A, so a 6-day user repeats the same three
workouts. Each B version below shares at most two exercises with its A version and uses only catalog
exercises. Rep ranges were chosen for muscle gain progression, as you asked.

| Push B | Pull B | Legs B |
|---|---|---|
| Incline Bench Press 4 × 6–10 | Neutral-Grip Lat Pulldown 4 × 8–12 | Hack Squat 4 × 8–12 |
| Machine Shoulder Press 3 × 8–12 | Chest-Supported Row 4 × 8–12 | Hip Thrust 4 × 8–12 |
| Pec Deck 3 × 10–15 | Single-Arm Cable Row 3 × 10–12 | Walking Lunge 3 × 10–12 per leg |
| Cable Lateral Raise 3 × 12–20 | Reverse Pec Deck 3 × 12–20 | Seated Leg Curl 3 × 10–15 |
| Rope Pushdown 3 × 10–15 | Incline Dumbbell Curl 3 × 10–12 | Leg Extension 3 × 12–15 |
| Overhead Cable Triceps Extension 2 × 10–15 | Cable Curl 2 × 12–15 | Seated Calf Raise 4 × 12–20 |
| Cable Crunch 3 × 10–15 | Hanging Leg Raise 3 × 8–12 | Hanging Knee Raise 3 × 10–15 |

Once approved, one guarded migration replaces the three Routines' exercises and stores their length
plans. Existing history stays as logged; members' next B workout uses the new content.

## Flows (built)

**Onboarding.** New question after "Training Days Per Week": *"How long do you usually want to train?"*
(30, 45, 60, 90; 60 preselected because today's sessions are built around it). It joins the onboarding
draft and is saved with the other answers.

**Existing users.** No saved length means 60 minutes, so nothing changes for them. Train's next-up card
shows a link, *"Set your usual workout length"*, until they choose one.

**Profile.** New row *"Usual Workout Length"* under the goal rows, opening a sheet that writes only
`workout_minutes` (`profile.html?edit=length` also opens it).

**Train.** The next-up card shows four chips with the usual length selected. Changing one updates the
preview right away: estimated minutes, what was shortened or added, and the exercise list with sets.
Start carries the chosen length for that one workout; the next workout starts on the usual length
again. A workout started at a chosen length resumes with the same version. Sessions without a stored
plan show no chips and start exactly as before.

## Schedule review — status

- **Advanced Muscle and Advanced Home Strength:** already handled by PR #143 (owner-approved
  2026-11-25; its database rows are applied, the schedule mapping waits for that PR to merge). Their
  length plans come after it merges.
- **Home Fat Loss:** not built yet; its sessions and weekly shape get written with the Program.
- **Bodyweight Fat Loss:** repeats the same four sessions at 4–6 days; review before its rollout.

## Rollout tracker

✓ = all four lengths validated and live · ◐ = validated, something pending · — = not started ·
✗ = schedule fix needed first.

| Program | 2 | 3 | 4 | 5 | 6 | Note |
|---|---|---|---|---|---|---|
| Muscle Gain (pilot) | ✓ | ✓ | ✓ | ✓ | ◐ | 6 days waits on the new Push/Pull/Legs B |
| 90-Day Fat Loss Blueprint | — | — | — | — | — | next |
| Glute Builder | — | — | — | — | — | |
| Home Strength | — | — | — | — | — | |
| Bodyweight Foundations | — | — | — | — | — | |
| Bodyweight Fat Loss | — | — | ✗ | ✗ | ✗ | same four at 4–6 days |
| Advanced Muscle | ◐ | ◐ | — | ◐ | ◐ | splits in PR #143 |
| Advanced Fat Loss | — | — | — | — | — | |
| Advanced Home Strength | ◐ | ◐ | — | ◐ | ◐ | splits in PR #143 (draft Program) |
| Home Fat Loss | ✗ | ✗ | ✗ | ✗ | ✗ | not built yet |
