-- Phase 4.3.6 CP8b (2/3). A relationship is readable only by someone entitled
-- to its Program, so enumerating relationship ids reveals nothing.
--
-- References ONLY programs + purchases, never workout_templates, so there is
-- no policy recursion with the Routine policy.
--
-- No INSERT/UPDATE/DELETE policy: relationship writes stay service-role only,
-- through the CP6 privileged endpoint. RLS with no policy denies all three.
create policy program_routines_read_entitled on public.program_routines
  for select to authenticated
  using (
    exists (
      select 1
      from public.programs g
      join public.purchases p
        on p.user_id = auth.uid()
       and p.status in ('active', 'past_due')
      where g.id = program_routines.program_id
        and (
          -- Branch S — standalone ownership. Reads NO catalog flags, so it
          -- survives the Program later being unpublished, retired, removed
          -- from membership, or withdrawn from sale.
          p.product = g.slug
          or
          -- Branch M — membership reaches only the ACTIVE library.
          ( p.product = 'ai_membership'
            and g.included_with_membership
            and g.status = 'published' )
        )
    )
  );