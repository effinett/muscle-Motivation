ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_program text;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS program_slug text;