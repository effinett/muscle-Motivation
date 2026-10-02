-- Security fix: paid program content (exercise/set/rep templates) was readable
-- by ANY authenticated user. Scope reads to users who actually own the program
-- (an active one-time purchase whose product == program_workouts.program_slug).
-- The client "locked" state was cosmetic; this enforces ownership at the data layer.
DROP POLICY IF EXISTS program_workouts_read ON public.program_workouts;

CREATE POLICY program_workouts_read ON public.program_workouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.user_id = auth.uid()
        AND p.product = program_workouts.program_slug
        AND p.status  = 'active'
    )
  );