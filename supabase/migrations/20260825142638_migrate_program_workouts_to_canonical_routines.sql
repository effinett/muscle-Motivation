-- Phase 4.3.6 CP8a — convert every legacy Program session into a canonical
-- platform Routine plus its Program relationship.
--
-- Proven before writing: all 40 distinct Program exercise names match a
-- canonical exercises row EXACTLY (0 alias, 0 fuzzy, 0 unmatched, 0
-- ambiguous), and all 325 entries already satisfy the CP3 contract. The only
-- change to any prescription is ADDING exercise_id — zero semantic drift.
--
-- Inserted one session at a time so each new Routine is linked to its legacy
-- row by primary key. A set-based join on session_name would be WRONG: names
-- like "Upper A" recur across Programs and are not unique.
--
-- Idempotent via program_routines.legacy_program_workout_id UNIQUE.
-- Reads program_workouts; writes only new rows, never modifies a legacy row.
do $$
declare
  author_id uuid;
  rec       record;
  new_id    uuid;
  built     jsonb;
begin
  -- Platform content stays owned by the platform account (taken from the
  -- existing CP6 platform Routine rather than hard-coded).
  select user_id into author_id from public.workout_templates where is_platform limit 1;
  if author_id is null then
    raise exception 'no platform author found — cannot own migrated Routines';
  end if;

  for rec in
    select pw.id as legacy_id, pw.session_key, pw.session_name, pw.sort_order,
           pw.exercises, p.id as program_id, p.goal as program_goal
    from public.program_workouts pw
    join public.programs p on p.slug = pw.program_slug
    where not exists (
      select 1 from public.program_routines pr
      where pr.legacy_program_workout_id = pw.id
    )
    order by pw.program_slug, pw.sort_order, pw.session_key
  loop
    -- Canonical CP3 key order; exercise_id resolved by EXACT name equality.
    select jsonb_agg(
             jsonb_build_object(
               'name',        e.val->>'name',
               'sets',        (e.val->>'sets')::int,
               'reps_low',    (e.val->>'reps_low')::int,
               'reps_high',   (e.val->>'reps_high')::int,
               'notes',       e.val->>'notes',
               'rest_sec',    (e.val->>'rest_sec')::int,
               'exercise_id', x.id
             ) order by e.ord
           )
      into built
      from lateral (
        select ordinality as ord, value as val
        from jsonb_array_elements(rec.exercises) with ordinality
      ) e
      join public.exercises x on x.name = e.val->>'name';

    -- Refuse to migrate a session whose entries did not all resolve. The join
    -- above drops unmatched rows, so a count mismatch means an unmapped name.
    if built is null
       or jsonb_array_length(built) <> jsonb_array_length(rec.exercises) then
      raise exception 'session % (%) has unmapped exercise names — refusing to migrate',
        rec.session_key, rec.legacy_id;
    end if;

    insert into public.workout_templates
      (user_id, name, exercises, goal, is_platform, visibility)
    values (author_id, rec.session_name, built, rec.program_goal, true, 'published')
    returning id into new_id;

    insert into public.program_routines
      (program_id, routine_id, session_key, sort_order, legacy_program_workout_id)
    values (rec.program_id, new_id, rec.session_key, rec.sort_order, rec.legacy_id);
  end loop;
end $$;