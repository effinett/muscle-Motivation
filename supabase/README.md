# Database structure (Supabase / Postgres)

Non-secret record of the Muscle Motivation database **structure**. It contains no
customer data, no auth users and no credentials.

| Path | What it is |
|---|---|
| `schema/current-schema.sql` | **Authoritative rebuild file.** Complete current structure of schema `public` (28 tables, constraints, indexes, row-level security, 62 policies, functions, triggers, grants, comments) plus the `auth.users` sign-up trigger and the `ensure_rls` event trigger. Schema only — no rows. |
| `schema/baseline-pre-2026-06-09.sql` | Objects created before migration tracking began (`profiles`, `handle_new_user` + `on_auth_user_created`, `rls_auto_enable` + `ensure_rls`). Only needed to replay history. |
| `migrations/` | The 81 migrations applied to production (as of 2026-11-25), with their original version numbers. History, not a rebuild script — see below. |

## Rebuild the structure on a new Supabase project

Apply `schema/current-schema.sql` once to a new, empty project (SQL editor or `psql`).
Supabase itself provides the roles, the `auth` schema and extensions. Data is restored
separately from the encrypted private backup, never from this repository.

## Why the migrations are not a rebuild script

Replaying `baseline` + `migrations/` in order rebuilds the same structure (verified),
but seventeen migrations are guarded **data** migrations that assert production row state
and deliberately abort on an empty database; they contain no structural changes:
`20260825142638`, `20260904042551`, `20260920231151`, `20260929030347`, `20260930032337`,
`20261002024350`, `20261002173108`, `20261003000515`, `20261005041336`, `20261116183238`,
`20261117192044`, `20261117204221`, `20261118005437`,
`20261118044157`, `20261118052821`, `20261119070922`,
`20261125200034`.

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

`20261005041336` (`phase_439b_cp4e_publish_bodyweight_frequency_routines`) publishes exactly
those six Routines, changing `visibility` from `private` to `published` and nothing else. It
requires each of them to match its CP4d record, plus the published Program, Full Body A/B/C, all
nine links, the equipment-free pool fingerprint and the catalog, and aborts on any divergence. It
inserts, deletes and relinks nothing and changes no schedule mapping. It checks ownership against
Full Body A/B/C rather than naming an account, so it needs no session setting either.

`20261116183238` (`phase_439b_bodyweight_rep_ranges`) changes only `reps_low` / `reps_high` at nine
slots on five Bodyweight Foundations Routines (owner-approved 2026-11-16), so no slot is a fixed
target. It proves each new array equals its old array with only those values changed, requires the
published Program, the five Routines and their links, and aborts on any divergence. It changes no
Program, link, schedule, catalog row or other Routine.

`20261117192044` (`phase_439l_home_strength_draft`, owner-approved 2026-11-17) adds Home Strength
as a **hidden draft**: one Program (`status = 'draft'`, membership-included, not standalone-purchasable,
`page_path = 'program.html?slug=home_strength'`), four private platform Routines (Full Body A/B/C and
Conditioning & Core, 25 prescription entries over 21 Dumbbell / Band / Bodyweight exercises) and their
four links (`full_a`, `full_b`, `full_c`, `conditioning_core`). It requires the exact starting catalog
counts, the exercise catalog and the Bodyweight Foundations Full Body A/B/C owner, and aborts on any
divergence. It inserts only; it publishes nothing, modifies no existing row, and creates no price,
purchase, entitlement or enrolment. It derives the owner from Full Body A/B/C, so it needs no session
setting. Publishing is a separate migration.

`20261117204221` (`phase_439l_publish_home_strength`, owner-approved 2026-11-17) publishes Home
Strength: its four Routines `private` -> `published`, then the Program `draft` -> `published`, and
nothing else. It requires every target row to match its `20261117192044` record (Routine contents by
md5), names each target by id so the unrelated private validation Routine cannot be reached, and
proves by fingerprint that no other row in `programs`, `workout_templates`, `program_routines` or
`exercises` changed. Access is unchanged: included with membership, not standalone-purchasable. It
creates no price, purchase, entitlement or enrolment.

`20261118005437` (`phase_439l_advanced_drafts`, owner-approved 2026-11-17) adds Advanced Muscle,
Advanced Fat Loss and Advanced Home Strength as **hidden drafts** in one migration: three Programs
(`status = 'draft'`, membership-included, not standalone-purchasable; 12, 12 and 10 weeks), twelve
private platform Routines (69 prescription entries over 53 exercises, copied from the approved Program
Catalog Plan) and their twelve links (`upper_a`/`lower_a`/`upper_b`/`lower_b` for Advanced Muscle and
Advanced Home Strength; `lower`, `upper`, `full_body`, `conditioning_core` for Advanced Fat Loss). It
requires the exact starting catalog counts, the exercise catalog, each Program's equipment promise and
the Bodyweight Foundations Full Body A/B/C owner, and aborts on any divergence. It inserts only; it
publishes nothing, modifies no existing row, and creates no price, purchase, entitlement or enrolment.
Publishing is a separate migration.

`20261118044157` (`phase_439l_publish_advanced_muscle`, owner-approved 2026-11-17) publishes
Advanced Muscle only: its four Routines `private` -> `published`, then the Program `draft` ->
`published`, and nothing else. It requires every target row to match its `20261118005437` record
(Routine contents by md5), names each target by id so the other Advanced drafts and the unrelated
private validation Routine cannot be reached, and proves by fingerprint that no other row in
`programs`, `workout_templates`, `program_routines`, `exercises`, `purchases`, `user_programs` or
`profiles` changed. Advanced Fat Loss and Advanced Home Strength stay drafts. Access is unchanged:
included with membership, not standalone-purchasable. It creates no price, purchase, entitlement or
enrolment.

`20261118052821` (`phase_439l_publish_advanced_fat_loss`, owner-approved 2026-11-18) publishes
Advanced Fat Loss only, with the same guards as `20261118044157`: its four Routines `private` ->
`published`, then the Program `draft` -> `published`, and nothing else. Every target row must match
its `20261118005437` record, and fingerprints prove no other row in `programs`, `workout_templates`,
`program_routines`, `exercises`, `purchases`, `user_programs` or `profiles` changed. Advanced Muscle
stays published and Advanced Home Strength stays a draft. Access is unchanged: included with
membership, not standalone-purchasable. It creates no price, purchase, entitlement or enrolment.

`20261119070922` (`phase_439l_bodyweight_fat_loss_draft`, owner-approved 2026-11-19, reviewed in
PR #128 at `a74ae30e`) adds Bodyweight Fat Loss as a **hidden draft**: one Program (`status = 'draft'`,
membership-included, not standalone-purchasable; 8 weeks, 4 days, `Bodyweight`), four private
platform Routines (21 prescription entries over 20 exercises, copied from the approved Program
Catalog Plan) and their four links (`full_a`, `conditioning_a`, `full_b`, `conditioning_b`). Every
exercise must be classified Bodyweight and be in the reviewed equipment-free pool. It requires the
exact starting catalog counts, the exercise catalog and the Bodyweight Foundations Full Body A/B/C
owner, and aborts on any divergence. It inserts only; it publishes nothing, modifies no existing row,
and creates no price, purchase, entitlement or enrolment. Publishing is a separate migration.

`20261125200034` (`phase_439l_advanced_day_splits`, owner-approved 2026-11-25) gives Advanced Muscle
and Advanced Home Strength their own split for every training-day choice. It inserts 18 private
platform Routines (115 prescription entries over 74 exercises) and 18 links, nine per Program at
sort_order 5–13 (`full_a`, `full_b`, `full_c`, `push_a`, `pull_a`, `legs_a`, `push_b`, `pull_b`,
`legs_b`), after the untouched Upper/Lower links. It requires Advanced Muscle published, Advanced
Home Strength draft, their four approved links and the Bodyweight Foundations owner; Advanced Home
Strength may use only Dumbbell, Band and Bodyweight exercises. It inserts only and changes no status,
price, purchase, entitlement or enrolment. `schedules.js` maps the new keys.

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

**Since that verification (not re-fingerprinted):** `food_search_events`
(`20261111111733`) and `usda_search_cache` (`20261111112151`), both 2026-11-11, were added
to `schema/current-schema.sql` by hand, with policy expressions, index definitions,
grants and comments copied from the live catalog. `usda_search_cache` is server-only: RLS
with no policies, and no privileges for `anon` or `authenticated`.
`20261116063127` (`food_search_events_quicklog`, 2026-11-16) replaces only the
`food_search_events` insert policy so it also accepts AI Quick Log outcomes; its live
policy text was copied into `schema/current-schema.sql` the same way.
`20261116191336` (`create_user_exercise_progressions`, 2026-11-16) adds the append-only
`user_exercise_progressions` table for Bodyweight Exercise Progression v1: owner-scoped INSERT and
SELECT policies only, no UPDATE or DELETE, nothing for `anon`. It was appended to
`schema/current-schema.sql` from the applied migration text.
