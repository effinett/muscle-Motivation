# Muscle Motivation — Documentation Index

One place to find every reference, roadmap and design record in this repository.
Files are **indexed here, not moved** — `AGENTS.md`, source comments and the roadmap
itself link to these paths, so they stay where they are.

## Reading order

1. **`../AGENTS.md`** — the one operating manual for every AI agent (rules, architecture invariants,
   brand, product, ship workflow). Codex reads it directly; `../CLAUDE.md` only imports it.
2. **`ROADMAP.md`** — the **only** authority for phase numbering, sequencing, scope and protected
   commitments. Start at §0 (North Star), §4 (critical path + gates G1–G6) and §13 (execution order).
3. **`ROADMAP-HISTORY.md`** — append-only record of phase closures, checkpoints and owner decisions.

## Roadmap & governance

| File | What it is | Status |
|---|---|---|
| [ROADMAP.md](ROADMAP.md) | Canonical product roadmap (adopted 2026-08-14) | **Authoritative** |
| [ROADMAP-HISTORY.md](ROADMAP-HISTORY.md) | Phase closures, checkpoint records, sequencing rationale | Append-only |
| [ai-master-blueprint.md](ai-master-blueprint.md) | AI vision and engineering principles | Rationale only — numbering superseded |
| [exercise-intelligence-roadmap.md](exercise-intelligence-roadmap.md) | Original exercise-intelligence plan | Rationale only — numbering superseded |
| [pwa-foundation.md](pwa-foundation.md) | PWA install + service-worker design record | Design reference — numbering superseded |

## Architecture & design references

| File | Domain | Code it describes |
|---|---|---|
| [architecture.md](architecture.md) | Per-module reference for every shared core (contracts, invariants, seams, tests) | All shared `*-core.js` / `food-*.js` / `exercise-*.js` modules |
| [food-resolution-core-design.md](food-resolution-core-design.md) | Shared food resolution (Phase 4.2.1) | `food-core.js` and siblings |
| [exercise-intelligence-architecture.md](exercise-intelligence-architecture.md) | Exercise taxonomy + resolution design | `exercise-core.js` |
| [exercise-intelligence-foundation.md](exercise-intelligence-foundation.md) | Shipped exercise-core reference (Phase 4.2.1E/F) | `exercise-core.js`, workout picker |
| [progression-spec.md](progression-spec.md) | Progressive-overload rules | `progression.js` |

## Historical SQL (reference only — never re-run)

| File | What it is |
|---|---|
| [phase1-metadata-backfill.DRAFT.sql](phase1-metadata-backfill.DRAFT.sql) | Early exercise metadata backfill draft (57-row catalog) |
| [phase-4-2-1k-pr-identity.sql](phase-4-2-1k-pr-identity.sql) | Phase 4.2.1K PR / custom-exercise identity migration record |

Tracked migrations live in `../supabase/migrations/`; the authoritative schema rebuild file is
`../supabase/schema/current-schema.sql` (see `../supabase/README.md`).

## Other references elsewhere in the repo

| Location | What it is |
|---|---|
| `../nutrition-evaluation/README.md` | Nutrition evaluation suite + baseline governance (authoritative) |
| `../nutrition-evaluation/BASELINE.md` | Current approved baseline summary |
| `../nutrition-evaluation/HISTORY.md` | Approved-milestone timeline (append-only) |
| `../supabase/README.md` | Database structure record (no data, no secrets) |
| `../benchmarks/` | Food + exercise resolution benchmark corpora |
| `../.github/workflows/ci.yml` | CI — **Continuous Evaluation** / required check `verify` |

## Rules for adding docs

- New design records go in `docs/` and get a row in this index.
- Never reuse or renumber a roadmap phase here — `ROADMAP.md` owns numbering.
- A superseded doc stays in place, marked superseded, for its rationale.
