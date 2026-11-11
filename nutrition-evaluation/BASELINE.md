# Nutrition Evaluation — Roadmap 5.4.11 Baseline (composed dishes)

Durable summary of the recorded baseline. Machine record: `baseline.json`.
Update deliberately via `node nutrition-evaluation/runner.js --update-baseline`.

- **Recorded:** 2026-11-11 on branch `feat/fndds-search` (roadmap 5.4.11); previous record was Phase 4.2.10c
- **Schema version:** `4.2.9-1`  ·  **Case-set version:** `4.2.9-1`
- **Total cases:** 294 (scored 292 · informational 2 · known_fail 0)
- **Production logic changed by this change:** yes — ranking. USDA FNDDS survey foods are searched, a
  survey row outside a dish category takes `RANK_WEIGHTS.surveyNonDish`, and `nfs` is a
  canonical-positive term. Pools without survey rows rank exactly as before (pinned by
  `food-ranking-survey.test.js`), so every pre-existing case is unchanged.

## Headline metrics

| Metric | Value |
|---|---|
| Overall pass rate (scored) | 100% (292/292) |
| Top-1 accuracy | 100% (24/24) |
| Acceptable-candidate accuracy | 100% (57/57) |
| Retrieval recall @1 / @3 / @5 / @10 | 95.8% / 100% / 100% / 100% |
| Clarification precision / recall | 100% (7/7) / 100% (7/7) |
| **False-confidence rate** | **0% (0/31)** |
| Display accuracy | 100% (76/76) |
| Portion accuracy | 100% (35/35) |
| Meal accuracy (case / item) | 100% / 100% |
| Parsing accuracy (case / field) | 100% / 100% |
| Display accuracy | 100% (73/73) |

## What moved vs the 4.2.10c baseline (roadmap 5.4.11)

- **Added 6 scored ranking cases** (`rank-fndds-*`, pools `nutrition-evaluation/pools-fndds.js`, captured
  from live USDA on 2026-11-11): caesar salad, taco, chicken burrito, sushi and pancakes resolve to the
  survey dish; chicken breast keeps the Foundation record over survey single foods.
- **Removed 0 · changed outcomes 0 · regression flips 0 · metric movement none.** One expectation I
  authored was corrected before recording: `topNotRegex: 'dressing'` also matched the correct dish
  ("…, no dressing"), so it became `'^salad dressing'`.
- Against the pre-change ranker the five dish cases already pass (the survey data itself fixes them) and
  `rank-fndds-chicken-breast-stays-foundation` fails — the live regression the dish rule prevents.

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
