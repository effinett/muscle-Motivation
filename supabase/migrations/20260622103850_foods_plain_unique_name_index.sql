-- The JS client's onConflict takes a column list, not an expression, so it can't
-- target a functional index on lower(name). Use a plain unique index on
-- (user_id, name) so foods upsert (onConflict: 'user_id,name') works.
drop index if exists public.foods_user_lower_name_uidx;
create unique index if not exists foods_user_name_uidx
  on public.foods (user_id, name);