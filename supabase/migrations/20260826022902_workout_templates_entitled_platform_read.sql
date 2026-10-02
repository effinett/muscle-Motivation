-- Phase 4.3.6 CP8b (3/3). Routine SELECT becomes: your own rows, OR a
-- PUBLISHED platform Routine linked to a Program you are entitled to.
--
-- The entitlement predicate is restated here rather than leaning on the
-- relationship policy alone, so loosening one policy later cannot silently
-- widen the other. Write policies are untouched — a client still cannot create
-- platform content, publish, or edit another user's Routine.
--
-- Knowing a Routine id grants nothing: the id appears only inside the EXISTS,
-- which still has to find an entitled Program link.
alter policy workout_templates_select on public.workout_templates
  using (
    auth.uid() = user_id
    or (
      is_platform = true
      and visibility = 'published'
      and exists (
        select 1
        from public.program_routines pr
        join public.programs g on g.id = pr.program_id
        join public.purchases p
          on p.user_id = auth.uid()
         and p.status in ('active', 'past_due')
        where pr.routine_id = workout_templates.id
          and (
            p.product = g.slug
            or ( p.product = 'ai_membership'
                 and g.included_with_membership
                 and g.status = 'published' )
          )
      )
    )
  );