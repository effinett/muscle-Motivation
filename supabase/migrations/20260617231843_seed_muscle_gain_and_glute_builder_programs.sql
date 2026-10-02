
-- Add exercises missing from the library
INSERT INTO public.exercises (name, category, primary_muscles, equipment) VALUES
('Reverse Lunge',           'Squat',   ARRAY['Quads','Glutes'],          'Bodyweight'),
('Cable Kickback',          'Hinge',   ARRAY['Glutes'],                   'Cable'),
('Seated Hip Abduction',    'Hinge',   ARRAY['Glutes','Abductors'],       'Machine'),
('Standing Hip Abduction',  'Hinge',   ARRAY['Glutes','Abductors'],       'Band'),
('Cable Pull-Through',      'Hinge',   ARRAY['Glutes','Hamstrings'],      'Cable'),
('Single-Leg Hip Thrust',   'Hinge',   ARRAY['Glutes'],                   'Bodyweight'),
('Dumbbell Step-Up',        'Squat',   ARRAY['Quads','Glutes'],           'Dumbbell')
ON CONFLICT (name) DO NOTHING;

-- ── MUSCLE GAIN ────────────────────────────────────────────────────
INSERT INTO public.program_workouts (program_slug, session_key, session_name, sort_order, exercises) VALUES

('muscle_gain', 'upper_a', 'Upper A', 1, '[
  {"name":"Bench Press","sets":4,"reps_low":6,"reps_high":10,"rest_sec":150,"notes":"Control the eccentric. Squeeze at the top on every rep."},
  {"name":"Barbell Row","sets":4,"reps_low":6,"reps_high":10,"rest_sec":150,"notes":"Chest supported if available. Drive elbows back."},
  {"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Full stretch at top, pull to upper chest."},
  {"name":"Face Pull","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":"Pull to forehead, elbows high and wide."},
  {"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":"Hold for 30-60 seconds."}
]'),

('muscle_gain', 'upper_b', 'Upper B', 2, '[
  {"name":"Incline Dumbbell Press","sets":4,"reps_low":6,"reps_high":10,"rest_sec":150,"notes":""},
  {"name":"Seated Cable Row","sets":4,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":"Control up and down. No swinging."},
  {"name":"Hammer Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Overhead Tricep Extension","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('muscle_gain', 'lower_a', 'Lower A', 3, '[
  {"name":"Barbell Back Squat","sets":4,"reps_low":5,"reps_high":10,"rest_sec":180,"notes":"Squat to depth. Drive through the full foot."},
  {"name":"Romanian Deadlift","sets":4,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":"Hinge at the hips. Feel the hamstrings load."},
  {"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per leg. Control the descent."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Leg Extension","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Standing Calf Raise","sets":4,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":"Full range."},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side. Slow and controlled."}
]'),

('muscle_gain', 'lower_b', 'Lower B', 4, '[
  {"name":"Leg Press","sets":4,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":"Full depth. Feet shoulder-width."},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":10,"rest_sec":120,"notes":"Per leg. Front foot far enough forward."},
  {"name":"Hip Thrust","sets":3,"reps_low":10,"reps_high":15,"rest_sec":90,"notes":"Squeeze glutes at the top."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Seated Calf Raise","sets":4,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Hanging Knee Raise","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""}
]'),

('muscle_gain', 'push', 'Push', 5, '[
  {"name":"Bench Press","sets":4,"reps_low":5,"reps_high":10,"rest_sec":180,"notes":""},
  {"name":"Overhead Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":""},
  {"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Cable Fly","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Overhead Tricep Extension","sets":2,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('muscle_gain', 'pull', 'Pull', 6, '[
  {"name":"Lat Pulldown","sets":4,"reps_low":5,"reps_high":10,"rest_sec":120,"notes":""},
  {"name":"Barbell Row","sets":4,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":""},
  {"name":"Face Pull","sets":3,"reps_low":15,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Straight-Arm Pulldown","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Barbell Curl","sets":3,"reps_low":8,"reps_high":12,"rest_sec":60,"notes":""},
  {"name":"Hammer Curl","sets":2,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Hanging Knee Raise","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""}
]'),

('muscle_gain', 'legs', 'Legs', 7, '[
  {"name":"Barbell Back Squat","sets":4,"reps_low":5,"reps_high":10,"rest_sec":180,"notes":"Phase 2: build to a top set of 5."},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":10,"rest_sec":120,"notes":"Per leg."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Leg Extension","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Standing Calf Raise","sets":4,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side."}
]'),

('muscle_gain', 'full_a', 'Full Body A', 8, '[
  {"name":"Barbell Back Squat","sets":4,"reps_low":5,"reps_high":10,"rest_sec":150,"notes":""},
  {"name":"Bench Press","sets":4,"reps_low":5,"reps_high":10,"rest_sec":150,"notes":""},
  {"name":"Barbell Row","sets":4,"reps_low":6,"reps_high":10,"rest_sec":150,"notes":""},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('muscle_gain', 'full_b', 'Full Body B', 9, '[
  {"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":10,"rest_sec":120,"notes":"Per leg."},
  {"name":"Overhead Press","sets":3,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":6,"reps_high":10,"rest_sec":90,"notes":""},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lateral Raise","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side."}
]'),

('muscle_gain', 'full_c', 'Full Body C', 10, '[
  {"name":"Leg Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":120,"notes":""},
  {"name":"Incline Dumbbell Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Seated Cable Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Face Pull","sets":3,"reps_low":15,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Farmer Carry","sets":3,"reps_low":30,"reps_high":40,"rest_sec":60,"notes":"Walk 30-40 seconds per set."}
]')

ON CONFLICT (program_slug, session_key) DO NOTHING;

-- ── GLUTE BUILDER ──────────────────────────────────────────────────
INSERT INTO public.program_workouts (program_slug, session_key, session_name, sort_order, exercises) VALUES

('glute_builder', 'session_a', 'Session A — Hip Thrust Lead', 1, '[
  {"name":"Hip Thrust","sets":4,"reps_low":6,"reps_high":12,"rest_sec":120,"notes":"Drive through heels. Squeeze and hold 1 second at the top. Hips do the work — not the lower back."},
  {"name":"Romanian Deadlift","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Hinge at hips, feel the hamstrings and glutes load."},
  {"name":"Reverse Lunge","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Per leg. Control the descent."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Cable Kickback","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":"Per leg. Squeeze the glute at peak extension."},
  {"name":"Seated Hip Abduction","sets":3,"reps_low":15,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Dead Bug","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":"Per side."}
]'),

('glute_builder', 'session_b', 'Session B — RDL Lead', 2, '[
  {"name":"Romanian Deadlift","sets":4,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":"Hinge at the hips. Bar stays close to the legs. Feel the hamstrings and glutes load on the way down."},
  {"name":"Leg Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":"Feet high on the platform to bias glutes."},
  {"name":"Bulgarian Split Squat","sets":3,"reps_low":8,"reps_high":10,"rest_sec":120,"notes":"Per leg. Front foot far enough forward."},
  {"name":"Cable Pull-Through","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":"Hip hinge pattern. Drive hips forward at the top."},
  {"name":"Leg Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Standing Hip Abduction","sets":3,"reps_low":15,"reps_high":20,"rest_sec":60,"notes":"Per leg."},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('glute_builder', 'session_c', 'Session C — Squat Lead', 3, '[
  {"name":"Barbell Back Squat","sets":4,"reps_low":6,"reps_high":10,"rest_sec":120,"notes":"Sit back and down. Squeeze the glutes at lockout — don''t just stand up, finish the movement."},
  {"name":"Single-Leg Hip Thrust","sets":3,"reps_low":10,"reps_high":12,"rest_sec":90,"notes":"Per leg. Drive through heel, squeeze hard at the top."},
  {"name":"Dumbbell Step-Up","sets":3,"reps_low":10,"reps_high":12,"rest_sec":90,"notes":"Per leg. Push through the heel of the working leg."},
  {"name":"Cable Kickback","sets":3,"reps_low":12,"reps_high":15,"rest_sec":60,"notes":"Per leg."},
  {"name":"Standing Calf Raise","sets":3,"reps_low":15,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Seated Hip Abduction","sets":3,"reps_low":15,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]'),

('glute_builder', 'upper', 'Upper Body', 4, '[
  {"name":"Dumbbell Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Seated Cable Row","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Dumbbell Shoulder Press","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Lat Pulldown","sets":3,"reps_low":8,"reps_high":12,"rest_sec":90,"notes":""},
  {"name":"Face Pull","sets":3,"reps_low":12,"reps_high":20,"rest_sec":60,"notes":""},
  {"name":"Bicep Curl","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Tricep Pushdown","sets":3,"reps_low":10,"reps_high":15,"rest_sec":60,"notes":""},
  {"name":"Plank","sets":3,"reps_low":30,"reps_high":60,"rest_sec":60,"notes":""}
]')

ON CONFLICT (program_slug, session_key) DO NOTHING;
