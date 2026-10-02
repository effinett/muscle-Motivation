-- Phase 4.3.6 CP8b (1/3). RLS on a referenced table filters subqueries inside
-- a policy. The Routine policy joins `programs` to resolve a slug, but the
-- existing policy exposes only status='published' — so a standalone owner of a
-- RETIRED Program would be denied their own purchased content. Permissive
-- policies OR together: `programs` is now readable when published OR
-- purchased. Nothing new leaks, and it is independently correct that a Program
-- you bought still shows its name after retirement.
create policy programs_read_purchased on public.programs
  for select to authenticated
  using (
    exists (
      select 1 from public.purchases p
      where p.user_id = auth.uid()
        and p.status in ('active', 'past_due')
        and p.product = programs.slug
    )
  );