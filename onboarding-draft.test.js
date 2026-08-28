/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7B — onboarding-draft.js
 *
 * The claim step writes into the canonical profile of a user who may already
 * have a plan, so these tests are weighted toward the destructive failures:
 * erasing a stored value, merging into a completed profile, and forwarding a
 * field that is not on the whitelist. Everything else is secondary.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';
const test = require('node:test');
const assert = require('node:assert');

const D = require('./onboarding-draft.js');

const NOW = 1787880000000;

// A complete, valid set of anonymous answers.
function answers(over) {
  return Object.assign({
    full_name: 'Jordan',
    gender: 'male',
    age: 32,
    height_cm: 177.8,
    weight_lbs: 185,
    body_fat_pct: 22,
    goal: 'fatloss',
    timeline: 'steady',
    goal_weight_lbs: 165,
    activity_level: 1.35,
    training_days: 4,
    training_experience: 'beginner',
    gym_access: 'full_gym'
  }, over || {});
}

// What the page's existing calculator produces — profile-shaped, real columns.
function candidate(over) {
  return Object.assign(answers(), {
    maintenance_calories: 2600,
    target_calories: 2100,
    protein_target: 167,
    fat_target: 58,
    carb_target: 234,
    training_split: 'Upper / Lower Split',
    goal_summary: 'Fat Loss — steady progress'
  }, over || {});
}

// A profile row as handle_new_user() leaves it immediately after signup.
function freshProfile(over) {
  return Object.assign({
    id: 'uuid-1',
    full_name: '',              // the trigger writes '', not null
    onboarding_complete: false,
    tier: 'free'
  }, over || {});
}

/* ══ emptiness ═══════════════════════════════════════════════════════════ */

test('0 and false are answers, not emptiness', () => {
  // The classic falsy bug: training_days = 0 ("not training yet") is a real
  // selection and must survive all the way to the column.
  assert.strictEqual(D.isEmpty(0), false);
  assert.strictEqual(D.isEmpty(false), false);
  assert.strictEqual(D.isEmpty(''), true);
  assert.strictEqual(D.isEmpty('   '), true);
  assert.strictEqual(D.isEmpty(null), true);
  assert.strictEqual(D.isEmpty(undefined), true);
  assert.strictEqual(D.isEmpty(NaN), true);
});

test('training_days = 0 is written, never skipped', () => {
  const patch = D.mergeIntoProfile(freshProfile(), candidate({ training_days: 0 }));
  assert.strictEqual(patch.training_days, 0);
});

/* ══ the whitelist ═══════════════════════════════════════════════════════ */

test('columns that must never be written are not claimable', () => {
  ['id', 'tier', 'stripe_customer_id', 'active_program', 'created_at',
    'onboarding_complete', 'updated_at'].forEach((k) => {
    assert.strictEqual(D.isClaimable(k), false, k + ' must not be claimable');
  });
});

test('a non-whitelisted key is never forwarded, however it arrives', () => {
  const patch = D.mergeIntoProfile(freshProfile(), candidate({
    tier: 'premium',
    stripe_customer_id: 'cus_evil',
    active_program: 'fat_loss_blueprint',
    onboarding_complete: true,
    id: 'uuid-someone-else',
    arbitrary_column: 'x'
  }));
  ['tier', 'stripe_customer_id', 'active_program', 'onboarding_complete',
    'id', 'arbitrary_column'].forEach((k) => {
    assert.ok(!(k in patch), k + ' leaked into the patch');
  });
});

test('onboarding_complete is never part of a field patch', () => {
  // It is ordered separately by the claim sequence — never merged.
  const patch = D.mergeIntoProfile(freshProfile(), candidate());
  assert.ok(!('onboarding_complete' in patch));
});

/* ══ GATE 1 — a completed profile is never merged into ════════════════════ */

test('a completed profile yields an EMPTY patch', () => {
  const patch = D.mergeIntoProfile(
    freshProfile({ onboarding_complete: true, goal: 'muscle', target_calories: 3000 }),
    candidate({ goal: 'fatloss', target_calories: 1800 }));
  assert.deepStrictEqual(patch, {});
});

test('the completed-profile gate holds even when the resolver would not', () => {
  // Independent of routing: called directly with a full candidate, it still
  // refuses. This is the second of two deliberately redundant gates.
  const existing = freshProfile({ onboarding_complete: true });
  assert.deepStrictEqual(D.mergeIntoProfile(existing, candidate()), {});
  // ...and the resolver independently refuses to route there at all.
  assert.strictEqual(
    D.resolveOnboardingState({ hasSession: true, onboardingComplete: true, hasDraft: true }),
    D.STATE.DISCARD_EXIT);
});

/* ══ GATE 2 — nothing is ever erased ═════════════════════════════════════ */

test('an empty candidate value never overwrites a stored value', () => {
  const existing = freshProfile({
    goal: 'muscle', weight_lbs: 200, training_days: 5, body_fat_pct: 18
  });
  const patch = D.mergeIntoProfile(existing, {
    goal: '', weight_lbs: null, training_days: undefined, body_fat_pct: NaN
  });
  assert.deepStrictEqual(patch, {});
});

test('an invalid candidate value never overwrites a stored value', () => {
  const existing = freshProfile({ age: 40, goal: 'muscle', training_days: 3 });
  const patch = D.mergeIntoProfile(existing, {
    age: 900, goal: 'bulking', training_days: 99
  });
  assert.deepStrictEqual(patch, {});
});

test('a valid candidate value fills an empty stored field', () => {
  const patch = D.mergeIntoProfile(freshProfile(), candidate());
  assert.strictEqual(patch.goal, 'fatloss');
  assert.strictEqual(patch.training_days, 4);
  assert.strictEqual(patch.target_calories, 2100);
});

test('body_fat_pct null never clears a stored body fat', () => {
  const existing = freshProfile({ body_fat_pct: 18 });
  const c = candidate();
  delete c.body_fat_pct;
  assert.ok(!('body_fat_pct' in D.mergeIntoProfile(existing, c)));
});

test('a partially-filled incomplete profile can only gain data', () => {
  // The §7 case: authenticated, onboarding_complete = false, some fields set.
  const existing = freshProfile({ weight_lbs: 200, goal: 'muscle' });
  const patch = D.mergeIntoProfile(existing, candidate());
  // Every key in the patch carries a real value — none is an erase.
  Object.keys(patch).forEach((k) => assert.ok(!D.isEmpty(patch[k]), k + ' is empty'));
});

/* ══ full_name — the stored value wins ═══════════════════════════════════ */

test('an OAuth-supplied full_name survives a draft that also has one', () => {
  const existing = freshProfile({ full_name: 'Jordan Ellery-Smith' });
  const patch = D.mergeIntoProfile(existing, candidate({ full_name: 'Jord' }));
  assert.ok(!('full_name' in patch), 'the stored OAuth name must win');
});

test("the trigger's empty-string full_name IS filled by the draft", () => {
  // handle_new_user writes '' when metadata is absent — that is no value.
  const patch = D.mergeIntoProfile(freshProfile({ full_name: '' }), candidate());
  assert.strictEqual(patch.full_name, 'Jordan');
});

test('a whitespace-only stored full_name is treated as empty', () => {
  const patch = D.mergeIntoProfile(freshProfile({ full_name: '   ' }), candidate());
  assert.strictEqual(patch.full_name, 'Jordan');
});

/* ══ purity and idempotence ══════════════════════════════════════════════ */

test('neither argument is mutated', () => {
  const existing = freshProfile({ goal: 'muscle' });
  const cand = candidate();
  const beforeE = JSON.stringify(existing);
  const beforeC = JSON.stringify(cand);
  D.mergeIntoProfile(existing, cand);
  assert.strictEqual(JSON.stringify(existing), beforeE);
  assert.strictEqual(JSON.stringify(cand), beforeC);
});

test('the patch is idempotent across repeated runs', () => {
  const existing = freshProfile();
  const cand = candidate();
  const a = JSON.stringify(D.mergeIntoProfile(existing, cand));
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(JSON.stringify(D.mergeIntoProfile(existing, cand)), a);
  }
});

test('re-claiming after a partial failure is a no-op', () => {
  // Simulate: the field write succeeded, the flag write did not, user retries.
  const existing = freshProfile();
  const patch1 = D.mergeIntoProfile(existing, candidate());
  const afterFirstWrite = Object.assign({}, existing, patch1);
  const patch2 = D.mergeIntoProfile(afterFirstWrite, candidate());
  // Same values, so re-applying changes nothing.
  Object.keys(patch2).forEach((k) => {
    assert.strictEqual(patch2[k], afterFirstWrite[k], k + ' differs on re-claim');
  });
});

test('null and undefined inputs do not throw', () => {
  assert.deepStrictEqual(D.mergeIntoProfile(null, null), {});
  assert.deepStrictEqual(D.mergeIntoProfile(undefined, candidate()).goal, 'fatloss');
  assert.deepStrictEqual(D.mergeIntoProfile(freshProfile(), null), {});
});

/* ══ envelope ════════════════════════════════════════════════════════════ */

test('a draft round-trips intact', () => {
  const raw = D.serializeDraft(answers(), 3, NOW);
  const draft = D.readDraft(raw, NOW);
  assert.strictEqual(draft.v, D.DRAFT_VERSION);
  assert.strictEqual(draft.step, 3);
  assert.strictEqual(draft.answers.goal, 'fatloss');
  assert.strictEqual(draft.answers.training_days, 4);
});

test('the version lives in the key as well as the payload', () => {
  assert.match(D.DRAFT_KEY, /_v1$/);
  assert.strictEqual(D.DRAFT_VERSION, 1);
});

test('every malformed envelope resolves to "no draft", never a partial one', () => {
  const bad = [
    '', 'not json', '{', 'null', '[]', '"string"',
    JSON.stringify({ v: 2, updatedAt: NOW, answers: answers() }),        // wrong version
    JSON.stringify({ updatedAt: NOW, answers: answers() }),              // no version
    JSON.stringify({ v: 1, answers: answers() }),                        // no timestamp
    JSON.stringify({ v: 1, updatedAt: 'soon', answers: answers() }),     // bad timestamp
    JSON.stringify({ v: 1, updatedAt: NOW }),                            // no answers
    JSON.stringify({ v: 1, updatedAt: NOW, answers: 'x' }),              // answers not object
    JSON.stringify({ v: 1, updatedAt: NOW, answers: [] }),               // answers is array
  ];
  bad.forEach((raw) => assert.strictEqual(D.readDraft(raw, NOW), null, 'accepted: ' + raw));
  [null, undefined, 42, {}].forEach((raw) => assert.strictEqual(D.readDraft(raw, NOW), null));
});

test('an expired draft is discarded', () => {
  const raw = D.serializeDraft(answers(), 2, NOW);
  assert.ok(D.readDraft(raw, NOW + D.DRAFT_TTL_MS - 1000) !== null);
  assert.strictEqual(D.readDraft(raw, NOW + D.DRAFT_TTL_MS + 1000), null);
});

test('a draft stamped in the future is discarded as a clock anomaly', () => {
  const raw = D.serializeDraft(answers(), 2, NOW + D.DRAFT_TTL_MS * 3);
  assert.strictEqual(D.readDraft(raw, NOW), null);
});

test('unknown keys never survive a round trip', () => {
  const raw = D.serializeDraft(
    Object.assign(answers(), { tier: 'premium', evil: 1 }), 1, NOW);
  const draft = D.readDraft(raw, NOW);
  assert.ok(!('tier' in draft.answers));
  assert.ok(!('evil' in draft.answers));
});

test('invalid answer values are dropped at write time', () => {
  const raw = D.serializeDraft(answers({ age: 900, goal: 'bulking' }), 1, NOW);
  const draft = D.readDraft(raw, NOW);
  assert.ok(!('age' in draft.answers));
  assert.ok(!('goal' in draft.answers));
  assert.strictEqual(draft.answers.weight_lbs, 185);   // the valid ones survive
});

test('derived values are never stored in the draft', () => {
  // Storing them would create exactly the stale-derivation problem the module
  // exists to avoid — targets are recomputed from answers every time.
  const raw = D.serializeDraft(candidate(), 5, NOW);
  const draft = D.readDraft(raw, NOW);
  ['maintenance_calories', 'target_calories', 'protein_target', 'fat_target',
    'carb_target', 'training_split', 'goal_summary'].forEach((k) => {
    assert.ok(!(k in draft.answers), k + ' must not be persisted to the draft');
  });
});

test('step is clamped to the wizard range', () => {
  assert.strictEqual(D.readDraft(D.serializeDraft(answers(), 99, NOW), NOW).step, 1);
  assert.strictEqual(D.readDraft(D.serializeDraft(answers(), 0, NOW), NOW).step, 1);
  assert.strictEqual(D.readDraft(D.serializeDraft(answers(), 5, NOW), NOW).step, 5);
});

test('completeness requires the wizard-required answers only', () => {
  assert.strictEqual(D.isComplete(D.readDraft(D.serializeDraft(answers(), 5, NOW), NOW)), true);
  // Optional fields absent → still complete.
  const lean = answers();
  delete lean.body_fat_pct; delete lean.goal_weight_lbs;
  delete lean.training_experience; delete lean.gym_access; delete lean.full_name;
  assert.strictEqual(D.isComplete(D.readDraft(D.serializeDraft(lean, 5, NOW), NOW)), true);
  // A required field missing → not complete.
  const noGoal = answers(); delete noGoal.goal;
  assert.strictEqual(D.isComplete(D.readDraft(D.serializeDraft(noGoal, 5, NOW), NOW)), false);
  assert.strictEqual(D.isComplete(null), false);
});

/* ══ state resolution ════════════════════════════════════════════════════ */

test('all six states resolve exactly as specified', () => {
  const r = (s, c, d) => D.resolveOnboardingState({
    hasSession: s, onboardingComplete: c, hasDraft: d });
  assert.strictEqual(r(false, false, false), D.STATE.ANON_NEW);
  assert.strictEqual(r(false, false, true),  D.STATE.ANON_RESUME);
  assert.strictEqual(r(true,  false, true),  D.STATE.CLAIM);
  assert.strictEqual(r(true,  false, false), D.STATE.AUTH_WIZARD);
  assert.strictEqual(r(true,  true,  true),  D.STATE.DISCARD_EXIT);
  assert.strictEqual(r(true,  true,  false), D.STATE.COMPLETE_EXIT);
});

test('resolution is total — no input combination is undefined', () => {
  const known = Object.keys(D.STATE).map((k) => D.STATE[k]);
  [true, false, undefined, null, 'yes', 0, 1].forEach((s) => {
    [true, false, undefined, null].forEach((c) => {
      [true, false, undefined, null].forEach((d) => {
        const out = D.resolveOnboardingState({
          hasSession: s, onboardingComplete: c, hasDraft: d });
        assert.ok(known.includes(out), 'undefined state for ' + [s, c, d]);
      });
    });
  });
  assert.ok(known.includes(D.resolveOnboardingState()));
  assert.ok(known.includes(D.resolveOnboardingState(null)));
});

test('a logged-out visitor is never routed to a claim', () => {
  assert.strictEqual(
    D.resolveOnboardingState({ hasSession: false, hasDraft: true }), D.STATE.ANON_RESUME);
});

/* ══ purity of the module itself ═════════════════════════════════════════ */

test('the pure layer touches no DOM, network, clock or randomness', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'onboarding-draft.js'), 'utf8');
  // sessionStorage IS present — it is the documented thin access layer — but
  // nothing else that would make behaviour non-deterministic may be.
  [/\bfetch\s*\(/, /supabaseClient/, /\bdocument\b/, /XMLHttpRequest/,
    /Math\.random/, /Date\.now/, /new Date\(/, /localStorage/,
    /anthropic/i].forEach((re) => {
    assert.ok(!re.test(src), 'onboarding-draft.js must not contain ' + re);
  });
});

test('time is injected, never read', () => {
  // Same TTL decision from the same inputs, forever.
  const raw = D.serializeDraft(answers(), 1, NOW);
  assert.strictEqual(D.readDraft(raw, NOW + 1000).updatedAt, NOW);
  assert.strictEqual(D.readDraft(raw, NOW + D.DRAFT_TTL_MS + 1), null);
});

test('storage access degrades rather than throwing when unavailable', () => {
  // In Node there is no sessionStorage at all — the exact "private mode"
  // shape. Every accessor must be safe.
  assert.strictEqual(D.hasStorage(), false);
  assert.strictEqual(D.loadDraft(NOW), null);
  assert.strictEqual(D.saveDraft(answers(), 1, NOW), false);
  assert.strictEqual(D.clearDraft(), false);
});
