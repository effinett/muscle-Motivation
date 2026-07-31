# Nutrition Evaluation — Phase 4.2.9 Baseline

Durable summary of the recorded baseline. Machine record: `baseline.json`.
Update deliberately via `node nutrition-evaluation/runner.js --update-baseline`.

- **SHA:** `47b973634de280201e9b082df3942e345bdbf216` (Phase 4.2.8, production-verified)
- **Schema version:** `4.2.9-1`  ·  **Case-set version:** `4.2.9-1`
- **Total cases:** 237 (scored 229 · informational 8 · known_fail 1)
- **Production logic changed by this phase:** no

## Headline metrics

| Metric | Value |
|---|---|
| Overall pass rate (scored) | 99.6% (228/229) |
| Top-1 accuracy | 100% (19/19) |
| Acceptable-candidate accuracy | 100% (47/47) |
| Retrieval recall @1 / @3 / @5 / @10 | 95.8% / 100% / 100% / 100% |
| Clarification precision / recall | 100% / 100% |
| **False-confidence rate** | **5% (1/20)** |
| Portion accuracy | 100% (35/35) |
| Meal accuracy (case / item) | 100% / 100% |
| Parsing accuracy (case / field) | 100% / 100% |
| Display accuracy | 100% (49/49) |

## Category counts

parsing 19 · retrieval 25 · ranking 39 · confidence 22 · clarification 12 ·
portion 35 · meal 22 · correction 9 · display 54 (regression pins distribute into
their `via` category).

## Known failures at baseline (honest, not hidden)

| Case | Stage | Nature |
|---|---|---|
| `conf-coffee-false-confidence` | production-defect | **Scored failure.** Bare "coffee" auto-resolves HIGH to "Coffee cake" instead of offering drink-vs-cake (contrast: "cola" correctly asks). The one non-passing scored case; drives the 5% false-confidence rate. Recommend a confidence-hardening phase. |
| `clar-coffee-should-ask` | production-defect (informational) | mirror of the above — "coffee" does not ask. |
| `rank-coffee-beverage-gap` | ranking (informational) | bare "coffee" ranks the cake first absent a beverage cue (same shape as the cola design). |
| `retr-salad-external-limit` | external-data-ambiguity (informational) | USDA has no generic composed "salad" record. |
| `disp-potato-flesh-artifact` | display (informational) | over-simplification leaves a leading "Flesh". |
| `disp-olive-oil-tail-artifact` | display (informational) | "salad or cooking" tail retained. |
| `disp-lentils-tail-artifact` | display (informational) | "mature seeds" tail retained. |
| `disp-yogurt-whole-milk-artifact` | display (informational) | "whole milk" descriptor surfaces. |
| `reg-4.2.8-cinnamon-duplication` | display (known_fail) | deferred 4.2.8 bug: "Cinnamon Cinnamon Granola" not de-duplicated. |

## Recommended future hardening (surfaced by this baseline)

1. **Confidence calibration for ambiguous beverage terms** — extend the cola-style
   ambiguity detection to "coffee"/"tea" so a bare beverage term offers
   drink-vs-cake instead of confidently resolving to the cake. (highest value —
   it is the only false-confidence case.)
2. **Display over-simplification cleanup** — strip trailing/leading USDA
   descriptors ("flesh", "mature seeds", "salad or cooking", "whole milk")
   without destroying source identity. Folds in the deferred
   `Cinnamon Cinnamon Granola` de-duplication.
3. **Restaurant / composed-dish coverage** — USDA lacks generic "salad" and some
   restaurant items; consider a curated supplemental source (external-data).
