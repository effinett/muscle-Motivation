-- The pre-existing UNIQUE(user_id, lower(name)) did not exclude archived rows,
-- so it would block archiving a custom and later recreating/restoring the same
-- name. Its active-row protection is fully subsumed by the archive-aware
-- user_exercises_active_norm_uidx (unique on (user_id, normalized_name) WHERE
-- archived_at IS NULL, using the stricter shared normalization). Drop it so the
-- soft-delete lifecycle works.
DROP INDEX IF EXISTS public.user_exercises_user_name_uniq;