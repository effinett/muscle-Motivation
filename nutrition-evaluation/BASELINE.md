# Nutrition Evaluation — Phase 4.2.10b Baseline

Durable summary of the recorded baseline. Machine record: `baseline.json`.
Update deliberately via `node nutrition-evaluation/runner.js --update-baseline`.

- **SHA:** `331334993c60e0f878d13bb456a30d719cc4185b` (Phase 4.2.10a; 4.2.10b metrics recorded pre-commit)
- **Schema version:** `4.2.9-1`  ·  **Case-set version:** `4.2.9-1`
- **Total cases:** 285 (scored 283 · informational 2 · known_fail 0)
- **Production logic changed by this phase:** YES — Phase 4.2.10b (ranking polarity +
  generic-first parenthetical guard + confidence Path C material-ambiguity escalation).

## Headline metrics

| Metric | Value |
|---|---|
| Overall pass rate (scored) | 100% (283/283) |
| Top-1 accuracy | 100% (19/19) |
| Acceptable-candidate accuracy | 100% (51/51) |
| Retrieval recall @1 / @3 / @5 / @10 | 95.8% / 100% / 100% / 100% |
| Clarification precision / recall | 100% (7/7) / 100% (7/7) |
| **False-confidence rate** | **0% (0/31)** |
| Portion accuracy | 100% (35/35) |
| Meal accuracy (case / item) | 100% / 100% |
| Parsing accuracy (case / field) | 100% / 100% |
| Display accuracy | 100% (73/73) |

## What moved vs the 4.2.9 baseline

- **False-confidence 5% → 0%.** The former `conf-coffee-false-confidence` was a
  STALE fixture (bare "coffee" auto-resolves correctly to brewed coffee via the
  canonical-generic boost, not the cake). Corrected to a gating auto-resolve proof.
- **Display 100% held; 4 prior display artifacts fixed** (potato "flesh", olive-oil
  and lentils tails, "Cinnamon Cinnamon" duplication) by Phase 4.2.10a.
- **Path C material-ambiguity escalation** added: broad multi-material ties
  (`soup`, `protein`, `shake`, `bar`, broad `cereal`) now clarify; defensible
  defaults and explicit subtypes (`coffee`, `tea`, `apple`, `rice`, `chicken`,
  `tomato soup`, `sweet tea`, `coffee cake`) stay auto. New `p10b-*` realistic
  multi-candidate pools exercise this.
- **Explicit sweetness polarity** ranking fix: `sweet tea` never resolves to
  unsweetened (and vice-versa).
- **Explicit product-family consistency**: `protein powder`/`shake`/`bar` drop
  incompatible families from the chooser (never offer greek yogurt); a single
  family-consistent lead auto-resolves, several same-family brands still clarify.

## Remaining informational (honest, not hidden)

| Case | Stage | Nature |
|---|---|---|
| `disp-yogurt-whole-milk-artifact` | display (informational) | DELIBERATE: "whole milk" is a meaningful fat basis for yogurt — preserved, not stripped (a later reading-order pass may reorder it as secondary metadata). |
| `retr-salad-external-limit` | external-data-ambiguity (informational) | USDA has no generic composed "salad" record. |

## Recommended future hardening (surfaced by this baseline)

1. **Ranking word-order sensitivity** — `firstTokenStart` makes "coffee black"
   score higher than "black coffee"; the AI parser masks this (it does not reorder
   tokens), but a small order-invariant tweak would harden it. Low priority.
2. **Restaurant / composed-dish coverage** — USDA lacks generic "salad" and some
   restaurant items; consider a curated supplemental source (external-data).
3. **Yogurt fat-basis presentation** — reorder "whole milk" as secondary metadata
   rather than in the primary display name (presentation, not removal).
