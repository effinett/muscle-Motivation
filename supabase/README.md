# Database structure (Supabase / Postgres)

Non-secret record of the Muscle Motivation database **structure**. It contains no
customer data, no auth users and no credentials.

| Path | What it is |
|---|---|
| `schema/current-schema.sql` | **Authoritative rebuild file.** Complete current structure of schema `public` (25 tables, constraints, indexes, row-level security, 59 policies, functions, triggers, grants, comments) plus the `auth.users` sign-up trigger and the `ensure_rls` event trigger. Schema only — no rows. |
| `schema/baseline-pre-2026-06-09.sql` | Objects created before migration tracking began (`profiles`, `handle_new_user` + `on_auth_user_created`, `rls_auto_enable` + `ensure_rls`). Only needed to replay history. |
| `migrations/` | The 67 migrations applied to production (as of 2026-10-03), with their original version numbers. History, not a rebuild script — see below. |

## Rebuild the structure on a new Supabase project

Apply `schema/current-schema.sql` once to a new, empty project (SQL editor or `psql`).
Supabase itself provides the roles, the `auth` schema and extensions. Data is restored
separately from the encrypted private backup, never from this repository.

## Why the migrations are not a rebuild script

Replaying `baseline` + `migrations/` in order rebuilds the same structure (verified),
but eight migrations are guarded **data** migrations that assert production row state
and deliberately abort on an empty database; they contain no structural changes:
`20260825142638`, `20260904042551`, `20260920231151`, `20260929030347`, `20260930032337`,
`20261002024350`, `20261002173108`, `20261003000515`.

`20261002173108` (`phase_439b_cp4c_bodyweight_guidance_pike_lean`) updates the exercise
JSON arrays of two Bodyweight Foundations Routines (Full Body A and B) under exact-state
guards: it requires the approved live Program, Routines, links and exercise catalog, and
aborts on anything else.

`20261003000515` (`phase_439b_cp4d_bodyweight_frequency_routines`) inserts six private
platform Routine drafts and their six Bodyweight Foundations Program links (positions
4–9). It requires the approved published Program, Full Body A/B/C and their links, and
the exercise catalog, including fingerprints of the 38 equipment-free exercises it may
use and the 14 it must not. It aborts on any divergence. It publishes nothing and changes
no schedule mapping, so the drafts stay inactive. It derives the owner from Full Body
A/B/C, so it needs no session setting.

Two of them (`20260920231151`, `20260929030347`) reference the platform owner account.
In this repository that one value is read from a session setting instead of being written
in the file; supply it from private recovery material before replaying:

```sql
SET mm.platform_owner_id = '<platform owner account uuid>';
```

If it is not set, those migrations fail immediately. Everything else in them is exactly
the text applied in production.

## Verification (2026-10-01)

Both rebuild paths were applied to isolated throwaway Postgres 17 databases and compared
with production by a catalog fingerprint covering tables, columns, constraints, indexes,
functions, triggers, policies, RLS flags, table/column/function grants and event triggers:
identical in every category.
