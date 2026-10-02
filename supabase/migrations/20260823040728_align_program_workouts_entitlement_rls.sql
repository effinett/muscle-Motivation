-- Phase 4.3.6 CP2-RLS — align program_workouts read enforcement with the
-- approved entitlement model in entitlement-core.js (CP2a).
--
-- BEFORE: standalone ownership only, and only status = 'active'.
--   EXISTS (SELECT 1 FROM purchases p
--           WHERE p.user_id = auth.uid()
--             AND p.product = program_workouts.program_slug
--             AND p.status  = 'active')
--
-- AFTER: Branch S OR Branch M, with 'past_due' qualifying in both.
--
-- ALTER POLICY changes only the USING expression; the policy name, command
-- (SELECT) and role (authenticated) are preserved, and there is no moment in
-- which the table is unprotected. No table shape, grant, other policy, or row
-- is touched. This migration writes no data.
alter policy program_workouts_read on public.program_workouts
using (
  exists (
    select 1
    from public.purchases p
    where p.user_id = auth.uid()
      -- 'past_due' keeps access during Stripe's dunning retry; 'canceled' and
      -- 'refunded' do not qualify, and 'refunded' is terminal in the webhook.
      and p.status in ('active', 'past_due')
      and (
        -- Branch S — standalone ownership. Deliberately independent of every
        -- catalog fact: a purchased Program stays readable even if it is later
        -- un-published, retired, or withdrawn from sale
        -- (standalone_purchasable = false). Sellability is never an ownership
        -- condition.
        p.product = program_workouts.program_slug

        or

        -- Branch M — membership access to the ACTIVE library only. A Program
        -- must both opt in and be published; draft and retired Programs are
        -- not part of what a membership grants.
        (
          p.product = 'ai_membership'
          and exists (
            select 1
            from public.programs g
            where g.slug = program_workouts.program_slug
              and g.included_with_membership
              -- Stated explicitly rather than relying on the programs RLS
              -- policy (which also filters to published). If that policy is
              -- ever widened — say for an admin surface — the membership
              -- branch must NOT silently start granting drafts.
              and g.status = 'published'
          )
        )
      )
  )
);