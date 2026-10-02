ALTER TABLE workout_exercises DROP CONSTRAINT IF EXISTS workout_exercises_workout_id_fkey;
ALTER TABLE workout_exercises ADD CONSTRAINT workout_exercises_workout_id_fkey
  FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE;

ALTER TABLE workout_sets DROP CONSTRAINT IF EXISTS workout_sets_workout_exercise_id_fkey;
ALTER TABLE workout_sets ADD CONSTRAINT workout_sets_workout_exercise_id_fkey
  FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE;