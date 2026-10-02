-- Phase 4.2.1K Migration 2 — run AFTER the new frontend is live in production.
-- Drop the old name-only PR unique now that PR writes are identity-based
-- (canonical → user_id,exercise_id; custom → user_id,user_exercise_id). This
-- lets an ambiguous-name canonical PR insert cleanly when a legacy name-only row
-- with the same name exists. The partial legacy unique index
-- (personal_records_user_legacy_uidx) still prevents duplicate legacy rows.
alter table public.personal_records drop constraint if exists personal_records_user_exercise_unique;