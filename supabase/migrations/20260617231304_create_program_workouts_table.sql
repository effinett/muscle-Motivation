
-- Program workouts: structured session definitions per program
CREATE TABLE IF NOT EXISTS public.program_workouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_slug  text NOT NULL,
  session_key   text NOT NULL,       -- e.g. 'upper_a', 'lower_b', 'push'
  session_name  text NOT NULL,       -- e.g. 'Upper A', 'Push'
  exercises     jsonb NOT NULL,      -- [{name, sets, reps_low, reps_high, rest_sec, notes}]
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (program_slug, session_key)
);
ALTER TABLE public.program_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "program_workouts_read" ON public.program_workouts
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- User program enrollment: tracks which schedule + current progress
CREATE TABLE IF NOT EXISTS public.user_programs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_slug   text NOT NULL,
  training_days  integer NOT NULL DEFAULT 3,  -- 2,3,4,5
  schedule_keys  text[] NOT NULL,             -- ordered session keys for the chosen schedule
  current_index  integer NOT NULL DEFAULT 0,  -- index into schedule_keys (cycles)
  started_at     date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, program_slug)
);
ALTER TABLE public.user_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_programs_own" ON public.user_programs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Seed Fat Loss Blueprint sessions
INSERT INTO public.program_workouts (program_slug, session_key, session_name, sort_order, exercises) VALUES

('fat_loss_blueprint', 'upper_a', 'Upper A', 1, '[
  {"name":"Dumbbell Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":"Control the lowering phase. 1-2 reps in reserve."},
  {"name":"Seated Cable Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Drive elbows back, hold 1 second at peak."},
  {"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Full stretch at top, pull to upper chest."},
  {"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":"Hold for 30-60 seconds."}
]'),

('fat_loss_blueprint', 'lower_a', 'Lower A', 2, '[
  {"name":"Goblet Squat","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":"Sit into it. Chest tall, knees out."},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Hinge from the hip, keep bar close to legs."},
  {"name":"Split Squat","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per leg. Control the descent."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Standing Calf Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":"Full range — all the way up, all the way down."},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side. Slow and controlled."}
]'),

('fat_loss_blueprint', 'upper_b', 'Upper B', 3, '[
  {"name":"Incline Dumbbell Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Seated Cable Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":"Control up and down. No swinging."},
  {"name":"Hammer Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Overhead Tricep Extension","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('fat_loss_blueprint', 'lower_b', 'Lower B', 4, '[
  {"name":"Leg Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":"Full depth. Feet shoulder-width."},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per leg. Front foot far enough forward."},
  {"name":"Hip Thrust","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Squeeze glutes at the top."},
  {"name":"Seated Calf Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Hanging Knee Raise","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""}
]'),

('fat_loss_blueprint', 'push', 'Push', 5, '[
  {"name":"Dumbbell Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Incline Dumbbell Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Overhead Tricep Extension","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('fat_loss_blueprint', 'pull', 'Pull', 6, '[
  {"name":"Lat Pulldown","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Seated Cable Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Dumbbell Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per arm."},
  {"name":"Face Pull","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":"Pull to forehead, elbows high."},
  {"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Hammer Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Hanging Knee Raise","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""}
]'),

('fat_loss_blueprint', 'legs', 'Legs', 7, '[
  {"name":"Goblet Squat","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Split Squat","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per leg."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Standing Calf Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side."}
]'),

('fat_loss_blueprint', 'full_a', 'Full Body A', 8, '[
  {"name":"Goblet Squat","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Dumbbell Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Seated Cable Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Bicep Curl","sets":2,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('fat_loss_blueprint', 'full_b', 'Full Body B', 9, '[
  {"name":"Split Squat","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per leg."},
  {"name":"Incline Dumbbell Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Hip Thrust","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Tricep Pushdown","sets":2,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side."}
]'),

('fat_loss_blueprint', 'full_c', 'Full Body C', 10, '[
  {"name":"Leg Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Dumbbell Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per arm."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Lateral Raise","sets":2,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Farmer Carry","sets":3,"reps_low":30,"reps_high":40,"rest_sec":60,"notes":"Walk 30-40 seconds per set."}
]')

ON CONFLICT (program_slug, session_key) DO NOTHING;
