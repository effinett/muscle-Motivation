// Category H — correction memory (food-memory.js nmCorrectionSignal via the
// options.signals seam). Deterministic: correction rows are supplied in-case (no
// DB, no user account). Scored like ranking — did the corrected candidate reach
// the top? Mirrors the proven correction-memory cases in the 121 corpus.

'use strict';

const K = (id, query, corrections, expected, extra) => Object.assign(
  { id, category: 'correction', input: { text: query, query }, corrections, expected }, extra || {});

module.exports = [
  /* baseline (no correction): the named-brand auto-pick is the caramel bar */
  K('corr-baseline-no-flip', 'fairlife protein bar', [],
    { preferredCandidateId: 999102 }, { subcategory: 'baseline', tags: ['correction-memory'] }),

  /* exact correction flips the pick to the user's chocolate bar */
  K('corr-exact-flip', 'fairlife protein bar', [{ query: 'fairlife protein bar', corrected_key: 'usda:999101', incorrect_key: 'usda:999102' }],
    { preferredCandidateId: 999101 }, { subcategory: 'exact', tags: ['correction-memory'] }),

  /* stored from a case/punctuation/plural variant, still applies to canonical query */
  K('corr-normalized-variant', 'fairlife protein bar', [{ query: 'Fairlife Protein Bars!', corrected_key: 'usda:999101', incorrect_key: 'usda:999102' }],
    { preferredCandidateId: 999101 }, { subcategory: 'normalized', tags: ['correction-memory'] }),

  /* reinforced correction (used repeatedly) still applies */
  K('corr-reinforced', 'fairlife protein bar', [{ query: 'fairlife protein bar', corrected_key: 'usda:999101', incorrect_key: 'usda:999102', reinforcement_count: 5 }],
    { preferredCandidateId: 999101 }, { subcategory: 'reinforced', tags: ['correction-memory'] }),

  /* conservative generalization: an explicit competing qualifier is NOT overridden */
  K('corr-conservative-generalization', 'fairlife caramel protein bar', [{ query: 'fairlife protein bar', corrected_key: 'usda:999101', incorrect_key: 'usda:999102' }],
    { preferredCandidateId: 999102 }, { subcategory: 'generalization', tags: ['correction-memory'] }),

  /* no false application: a correction for an UNRELATED query leaves this one alone */
  K('corr-no-false-apply', 'fairlife protein bar', [{ query: 'jasmine rice', corrected_key: 'usda:999012', incorrect_key: 'usda:999011' }],
    { preferredCandidateId: 999102 }, { subcategory: 'isolation', tags: ['correction-memory'] }),

  /* correction on a different pool applies within it (jasmine rice brands) */
  K('corr-jasmine-flip', 'jasmine rice', [{ query: 'jasmine rice', corrected_key: 'usda:999012', incorrect_key: 'usda:999011' }],
    { preferredCandidateId: 999012 }, { subcategory: 'exact', tags: ['correction-memory', 'brand'] }),
];
