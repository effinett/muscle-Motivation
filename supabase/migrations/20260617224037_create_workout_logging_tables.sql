
-- Exercise library (shared, read-only for authenticated users)
CREATE TABLE IF NOT EXISTS public.exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  category      text,
  primary_muscles text[],
  equipment     text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercises_select" ON public.exercises
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- Workout sessions
CREATE TABLE IF NOT EXISTS public.workouts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text,
  date             date NOT NULL DEFAULT CURRENT_DATE,
  notes            text,
  duration_minutes integer,
  completed        boolean NOT NULL DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workouts_own" ON public.workouts
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Exercises within a workout
CREATE TABLE IF NOT EXISTS public.workout_exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id    uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  order_index   integer NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workout_exercises_own" ON public.workout_exercises
  USING (
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = workout_exercises.workout_id
      AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = workout_exercises.workout_id
      AND w.user_id = auth.uid()
    )
  );

-- Sets within a workout exercise
CREATE TABLE IF NOT EXISTS public.workout_sets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_exercise_id uuid NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  set_number          integer NOT NULL,
  weight_lbs          numeric,
  reps                integer,
  completed           boolean NOT NULL DEFAULT false,
  notes               text,
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workout_sets_own" ON public.workout_sets
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
      AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_sets.workout_exercise_id
      AND w.user_id = auth.uid()
    )
  );

-- Seed exercise library
INSERT INTO public.exercises (name, category, primary_muscles, equipment) VALUES
('Barbell Back Squat',       'Squat',            ARRAY['Quads','Glutes'],              'Barbell'),
('Goblet Squat',             'Squat',            ARRAY['Quads','Glutes'],              'Dumbbell'),
('Leg Press',                'Squat',            ARRAY['Quads','Glutes'],              'Machine'),
('Split Squat',              'Squat',            ARRAY['Quads','Glutes'],              'Bodyweight'),
('Bulgarian Split Squat',    'Squat',            ARRAY['Quads','Glutes'],              'Dumbbell'),
('Leg Extension',            'Squat',            ARRAY['Quads'],                       'Machine'),
('Romanian Deadlift',        'Hinge',            ARRAY['Hamstrings','Glutes'],         'Barbell'),
('Conventional Deadlift',    'Hinge',            ARRAY['Hamstrings','Glutes','Back'],  'Barbell'),
('Trap Bar Deadlift',        'Hinge',            ARRAY['Hamstrings','Glutes','Back'],  'Barbell'),
('Hip Thrust',               'Hinge',            ARRAY['Glutes'],                      'Barbell'),
('Leg Curl',                 'Hinge',            ARRAY['Hamstrings'],                  'Machine'),
('Bench Press',              'Horizontal Push',  ARRAY['Chest','Triceps'],             'Barbell'),
('Incline Bench Press',      'Horizontal Push',  ARRAY['Upper Chest','Triceps'],       'Barbell'),
('Dumbbell Press',           'Horizontal Push',  ARRAY['Chest','Triceps'],             'Dumbbell'),
('Incline Dumbbell Press',   'Horizontal Push',  ARRAY['Upper Chest','Triceps'],       'Dumbbell'),
('Push-Up',                  'Horizontal Push',  ARRAY['Chest','Triceps'],             'Bodyweight'),
('Cable Fly',                'Horizontal Push',  ARRAY['Chest'],                       'Cable'),
('Overhead Press',           'Vertical Push',    ARRAY['Shoulders','Triceps'],         'Barbell'),
('Dumbbell Shoulder Press',  'Vertical Push',    ARRAY['Shoulders','Triceps'],         'Dumbbell'),
('Lateral Raise',            'Vertical Push',    ARRAY['Shoulders'],                   'Dumbbell'),
('Front Raise',              'Vertical Push',    ARRAY['Front Delts'],                 'Dumbbell'),
('Barbell Row',              'Horizontal Pull',  ARRAY['Back','Biceps'],               'Barbell'),
('Dumbbell Row',             'Horizontal Pull',  ARRAY['Back','Biceps'],               'Dumbbell'),
('Seated Cable Row',         'Horizontal Pull',  ARRAY['Back','Biceps'],               'Cable'),
('Machine Row',              'Horizontal Pull',  ARRAY['Back','Biceps'],               'Machine'),
('Face Pull',                'Horizontal Pull',  ARRAY['Rear Delts','Upper Back'],     'Cable'),
('Pull-Up',                  'Vertical Pull',    ARRAY['Lats','Biceps'],               'Bodyweight'),
('Chin-Up',                  'Vertical Pull',    ARRAY['Lats','Biceps'],               'Bodyweight'),
('Lat Pulldown',             'Vertical Pull',    ARRAY['Lats','Biceps'],               'Cable'),
('Straight-Arm Pulldown',    'Vertical Pull',    ARRAY['Lats'],                        'Cable'),
('Plank',                    'Core',             ARRAY['Core'],                        'Bodyweight'),
('Crunches',                 'Core',             ARRAY['Abs'],                         'Bodyweight'),
('Lying Leg Raise',          'Core',             ARRAY['Abs'],                         'Bodyweight'),
('Russian Twist',            'Core',             ARRAY['Abs'],                         'Bodyweight'),
('Dead Bug',                 'Core',             ARRAY['Core'],                        'Bodyweight'),
('Hanging Knee Raise',       'Core',             ARRAY['Abs'],                         'Bodyweight'),
('Bicep Curl',               'Biceps',           ARRAY['Biceps'],                      'Dumbbell'),
('Barbell Curl',             'Biceps',           ARRAY['Biceps'],                      'Barbell'),
('Hammer Curl',              'Biceps',           ARRAY['Biceps','Brachialis'],         'Dumbbell'),
('Cable Curl',               'Biceps',           ARRAY['Biceps'],                      'Cable'),
('Tricep Pushdown',          'Triceps',          ARRAY['Triceps'],                     'Cable'),
('Overhead Tricep Extension','Triceps',          ARRAY['Triceps'],                     'Dumbbell'),
('Skull Crusher',            'Triceps',          ARRAY['Triceps'],                     'Barbell'),
('Dips',                     'Triceps',          ARRAY['Triceps','Chest'],             'Bodyweight'),
('Standing Calf Raise',      'Calves',           ARRAY['Calves'],                      'Machine'),
('Seated Calf Raise',        'Calves',           ARRAY['Calves'],                      'Machine'),
('Farmer Carry',             'Carry',            ARRAY['Traps','Core','Grip'],         'Dumbbell'),
('Incline Treadmill Walk',   'Cardio',           ARRAY['Legs'],                        'Machine'),
('Treadmill Run',            'Cardio',           ARRAY['Full Body'],                   'Machine'),
('Box Jump',                 'Plyometric',       ARRAY['Quads','Glutes'],              'Bodyweight')
ON CONFLICT (name) DO NOTHING;
