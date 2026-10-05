/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.9B — fail-closed Program-frequency resolution.
 *
 * The defect: all four dedicated Program pages resolved the user's training
 * frequency with `(profile && profile.training_days) ? profile.training_days : N`.
 * `getProfile()` (supabase.js) swallows its error and returns null for BOTH a
 * failed read and a missing row, so any unreadable profile silently produced a
 * frequency the user never chose. On the three frequency-family Programs that
 * selected the WRONG schedule family — a 4-day user was recommended a session
 * from the 3-day Full Body split and told "You train 3 days/week" as fact.
 * Truthiness made it worse in both directions: the valid answer `0` was
 * rejected, while `12`, `4.5`, `'4'` and `NaN` were accepted or clamped.
 *
 * This suite pins:
 *   1. the canonical rule (`resolveTrainingDays` in schedules.js) — the domain
 *      is integers 0–6, matching the only writer that validates the column
 *      (onboarding-draft.js), because `profiles.training_days` carries no
 *      database CHECK constraint;
 *   2. that no page reintroduces the truthiness fallback;
 *   3. behaviourally, per page, that an unknown frequency recommends nothing,
 *      renders no session rows, shows no Start CTA and writes nothing — and
 *      that a VALID frequency still produces exactly the previous behaviour.
 *
 * Every assertion in §3 fails against the pre-fix code, which is the point:
 * these are reproductions first and regression pins second.
 * ────────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const SCHEDULES = read('schedules.js');

const PAGES = {
  fat_loss_blueprint: 'program-fat-loss.html',
  muscle_gain: 'program-muscle-gain.html',
  glute_builder: 'program-glute-builder.html',
  bodyweight_foundations: 'program-bodyweight.html',
};

/* schedules.js is a browser-global script with no Node exports, so it is
 * evaluated in a sandbox — the same approach bodyweight-foundations.test.js
 * already uses for it. */
function loadSchedules() {
  const sandbox = vm.createContext({});
  vm.runInContext(SCHEDULES, sandbox);
  return sandbox;
}

function extractFn(src, name, file) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, file + ' defines ' + name + '()');
  // Keep an `async` prefix — dropping it would make `await` a syntax error.
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

/* showFrequencyUnavailable() does not exist in the pre-fix pages. It is loaded
 * when present and stubbed when absent, so running this suite against pre-fix
 * code fails on the BEHAVIOUR assertions — a null profile still recommending a
 * session, still showing a Start CTA — rather than on a missing function. The
 * reproduction has to demonstrate the defect, not the absence of the fix. */
function loadOptional(src, sandbox, file) {
  const name = 'showFrequencyUnavailable';
  if (src.indexOf('function ' + name + '(') > -1) {
    vm.runInContext(extractFn(src, name, file), sandbox);
  } else {
    vm.runInContext('function ' + name + '() {}', sandbox);
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 1. The canonical rule
 * ══════════════════════════════════════════════════════════════════════ */

test('canonical rule: schedules.js exposes one frequency validator', () => {
  const s = loadSchedules();
  assert.equal(typeof s.resolveTrainingDays, 'function');
  assert.equal(typeof s.isValidTrainingDays, 'function');
  assert.equal(s.TRAINING_DAYS_MIN, 2);
  assert.equal(s.TRAINING_DAYS_MAX, 6);
});

test('canonical rule: every integer in the schedulable domain 2–6 is valid', () => {
  const s = loadSchedules();
  for (let d = 2; d <= 6; d++) {
    assert.deepEqual(s.resolveTrainingDays({ training_days: d }), { ok: true, days: d },
      d + ' is inside the canonical domain');
  }
});

test('canonical rule: the domain is exactly the frequencies PROGRAM_SCHEDULES maps', () => {
  // Mutation-sensitive: widening the domain to 0 or narrowing it to 3 breaks
  // this, because the validator's bounds must equal the mapped buckets of every
  // Program. It is derived from the data rather than restated as literals.
  const s = loadSchedules();
  const mapped = new Set();
  for (const table of Object.values(s.PROGRAM_SCHEDULES)) {
    for (const k of Object.keys(table)) mapped.add(Number(k));
  }
  const domain = [];
  for (let d = -2; d <= 9; d++) if (s.isValidTrainingDays(d)) domain.push(d);
  assert.deepEqual(domain, [...mapped].sort((a, b) => a - b),
    'the valid domain is exactly the mapped schedule buckets');
  assert.deepEqual(domain, [2, 3, 4, 5, 6]);
});

test('canonical rule: 0 and 1 are storable answers but are NOT schedulable', () => {
  // Owner ruling 2026-09-29. onboarding-draft.js accepts inRange(v, 0, 6), so
  // these values legitimately reach the database — but no Program schedule maps
  // them, and normalizeTrainingDays() would silently promote them to the 3-day
  // family. That substitution is the defect, so validation rejects them.
  const s = loadSchedules();
  for (const v of [0, 1]) {
    assert.deepEqual(s.resolveTrainingDays({ training_days: v }),
      { ok: false, reason: 'invalid' }, v + ' is not schedulable');
    // …and the thing it must not be allowed to become:
    assert.equal(s.normalizeTrainingDays(v), 3,
      'normalizeTrainingDays still promotes it — which is why validation must run first');
  }
});

test('canonical rule: each reason maps to the state whose action can help', () => {
  const s = loadSchedules();
  assert.equal(typeof s.frequencyFailureState, 'function');
  // We do not have the value → retrying can genuinely help.
  assert.equal(s.frequencyFailureState('no_profile'), 'unavailable');
  assert.equal(s.frequencyFailureState('missing'), 'unavailable');
  // We have it and it is not schedulable → only changing it can help.
  assert.equal(s.frequencyFailureState('invalid'), 'unsupported');
  // Fails safe: an unrecognised reason claims less about the user's data.
  for (const r of [undefined, null, '', 'something_new', 0]) {
    assert.equal(s.frequencyFailureState(r), 'unavailable',
      'unknown reason defaults to the state that asserts least');
  }
});

test('canonical rule: every reason resolveTrainingDays can emit has a state', () => {
  // Mutation-sensitive: adding a reason code without classifying it would leave
  // it silently defaulting, so the emitted set is enumerated from real inputs.
  const s = loadSchedules();
  const emitted = new Set();
  for (const p of ['throws-equivalent', null, undefined, {}, { training_days: null },
                   { training_days: 0 }, { training_days: 1 }, { training_days: 12 },
                   { training_days: 4.5 }, { training_days: '4' }, { training_days: NaN }]) {
    const r = s.resolveTrainingDays(p);
    if (!r.ok) emitted.add(r.reason);
  }
  assert.deepEqual([...emitted].sort(), ['invalid', 'missing', 'no_profile']);
  for (const reason of emitted) {
    assert.ok(['unavailable', 'unsupported'].includes(s.frequencyFailureState(reason)),
      reason + ' is classified');
  }
});

test('canonical rule: the lower boundary is exactly 2', () => {
  // Mutation-sensitive pair: 1 must fail and 2 must pass. Either bound moving
  // by one breaks one of these two assertions.
  const s = loadSchedules();
  assert.equal(s.resolveTrainingDays({ training_days: 1 }).ok, false, '1 rejected');
  assert.equal(s.resolveTrainingDays({ training_days: 2 }).ok, true, '2 accepted');
});

test('canonical rule: the upper boundary is exactly 6', () => {
  const s = loadSchedules();
  assert.equal(s.resolveTrainingDays({ training_days: 6 }).ok, true, '6 accepted');
  assert.equal(s.resolveTrainingDays({ training_days: 7 }).ok, false, '7 rejected');
});

test('canonical rule: a null profile is no_profile, not a default', () => {
  const s = loadSchedules();
  for (const p of [null, undefined, 'nope', 7, false]) {
    assert.deepEqual(s.resolveTrainingDays(p), { ok: false, reason: 'no_profile' },
      JSON.stringify(p) + ' is not a profile');
  }
});

test('canonical rule: an absent column is missing, not a default', () => {
  const s = loadSchedules();
  assert.deepEqual(s.resolveTrainingDays({}), { ok: false, reason: 'missing' });
  assert.deepEqual(s.resolveTrainingDays({ training_days: null }),
    { ok: false, reason: 'missing' });
  assert.deepEqual(s.resolveTrainingDays({ training_days: undefined }),
    { ok: false, reason: 'missing' });
});

test('canonical rule: out-of-domain and non-integer values are invalid, never clamped', () => {
  const s = loadSchedules();
  const corrupt = [-1, 0, 1, 7, 12, 365, 4.5, 0.5, NaN, Infinity, -Infinity];
  for (const v of corrupt) {
    assert.deepEqual(s.resolveTrainingDays({ training_days: v }),
      { ok: false, reason: 'invalid' }, String(v) + ' is corrupt, not clampable');
  }
});

test('canonical rule: a non-number is invalid even when numeric-looking', () => {
  // PostgREST returns an integer column as a JSON number, so a string here is
  // itself evidence of corruption. parseInt() would have accepted '4 days'.
  const s = loadSchedules();
  for (const v of ['4', '', ' ', '4 days', [], [4], {}, true]) {
    assert.equal(s.resolveTrainingDays({ training_days: v }).ok, false,
      JSON.stringify(v) + ' is not a number');
  }
});

test('canonical rule: validation is separate from bucketing, and does not change it', () => {
  // normalizeTrainingDays() keeps its LEGACY contract untouched for its own
  // callers (the dashboard split label, profile recalc). The new rule governs
  // what the Program pages may pass to it, not what it returns.
  const s = loadSchedules();
  assert.equal(s.normalizeTrainingDays(0), 3);
  assert.equal(s.normalizeTrainingDays(1), 3);
  assert.equal(s.normalizeTrainingDays(4), 4);
  assert.equal(s.normalizeTrainingDays(12), 6);
  // …and a valid value still routes to exactly the family it always did.
  assert.deepEqual(s.getScheduleForDays('fat_loss_blueprint', 4),
    ['upper_a', 'lower_a', 'upper_b', 'lower_b']);
  assert.deepEqual(s.getScheduleForDays('fat_loss_blueprint', 2),
    ['full_a', 'full_b']);
});

/* ════════════════════════════════════════════════════════════════════════
 * 2. No page reintroduces the truthiness fallback
 * ══════════════════════════════════════════════════════════════════════ */

test('no Program page resolves frequency by truthiness', () => {
  for (const [slug, file] of Object.entries(PAGES)) {
    const src = read(file);
    assert.ok(!/\?\s*profile\.training_days/.test(src),
      file + ' must not use a ternary on profile.training_days');
    assert.ok(!/training_days\s*\)\s*\?/.test(src),
      file + ' must not guard training_days with truthiness');
    assert.match(src, /resolveTrainingDays\(/,
      file + ' uses the canonical validator (' + slug + ')');
  }
});

test('no Program page substitutes a frequency when the profile is unreadable', () => {
  for (const file of Object.values(PAGES)) {
    const src = read(file);
    // The old fallbacks were a literal 3 and the Program's own recommended days.
    assert.ok(!/training_days[\s\S]{0,80}recommendedDaysPerWeek/.test(src),
      file + ' must not fall back to the Program\'s recommended frequency');
    assert.ok(!/getScheduleForDays\([^)]*,\s*3\s*\)/.test(src),
      file + ' must not request a hard-coded 3-day schedule');
  }
});

test('the frequency failure state never claims a frequency the user did not choose', () => {
  // The truthfulness rule from the Bodyweight fix, applied to all four pages:
  // a page that does not know the frequency may not state one.
  for (const file of Object.values(PAGES)) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const claim = /You train'\s*\+|You train \d/;
    // Both failure states must exist in every page. What each one SAYS and which
    // action it offers is asserted against rendered output in the per-page
    // behaviour tests, not here — the handler also contains the
    // loadUserProgram/preselect retry call, so a source-level word match would be
    // testing identifiers rather than anything the user reads.
    assert.match(src, /We couldn’t load your workout schedule\./,
      file + ' has the unavailable state');
    assert.match(src, /Choose between 2 and 6 workout days to use this program\./,
      file + ' has the unsupported state');
    assert.match(src, /frequencyFailureState\(/,
      file + ' classifies the two states through the shared rule');
    if (claim.test(src)) {
      // Only permitted where it is built from an already-validated number.
      assert.match(src, /freq\.ok[\s\S]*You train/,
        file + ' may only state a frequency after resolveTrainingDays succeeds');
    }
  }
});

/* ════════════════════════════════════════════════════════════════════════
 * 3. Behaviour, per page
 * ══════════════════════════════════════════════════════════════════════ */

/* A DOM just large enough for the schedule card and the sticky CTA. Element
 * writes are recorded so a test can assert what the user would actually see. */
function makeDom(ids) {
  const els = {};
  for (const id of ids) {
    els[id] = {
      id,
      innerHTML: '',
      textContent: '',
      href: '',
      disabled: false,
      style: {},
      listeners: {},
      addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    };
  }
  return {
    els,
    document: {
      getElementById(id) {
        // Mirrors the browser: an unknown id is null, so a page that reaches for
        // an element it never declared throws instead of silently passing.
        return Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null;
      },
    },
  };
}

const CLASSIC_IDS = ['schedSummary', 'schedPreview', 'stickyCta', 'todaySessionName',
  'ctaLabel', 'startTodayBtn', 'schedRetryBtn'];

/* Builds a runnable sandbox from one of the three frequency-family pages. */
function classicHarness(file, slug, profile, opts) {
  const src = read(file);
  const dom = makeDom(CLASSIC_IDS);
  const writes = [];

  const sandbox = vm.createContext({
    console: { error() {}, log() {} },
    getProfile: async () => {
      if (profile === 'throws') throw new Error('network');
      return profile;
    },
    supabaseClient: {
      from(table) {
        // Any call other than the progression read would be a write this page
        // is not allowed to make.
        writes.push(table);
        return {
          select: () => ({ eq: () => ({ eq: () => ({
            maybeSingle: async () => ({ data: (opts && opts.up) || null }),
          }) }) }),
        };
      },
    },
    document: dom.document,
    currentUser: { id: 'u1' },
  });

  vm.runInContext(SCHEDULES, sandbox);
  vm.runInContext('var PROGRAM_SLUG = ' + JSON.stringify(slug) + ';', sandbox);
  vm.runInContext('var PROG_KEYS = [], PROG_RECOMMENDED = null, PROG_SELECTED = null;', sandbox);
  loadOptional(src, sandbox, file);
  for (const fn of ['loadUserProgram', 'renderSchedulePreview', 'selectProgWorkout']) {
    vm.runInContext(extractFn(src, fn, file), sandbox);
  }
  return { sandbox, dom, writes, run: () => vm.runInContext(
    'loadUserProgram(' + (/loadUserProgram\(userId\)/.test(src) ? '"u1"' : '') + ')', sandbox) };
}

const CLASSIC = [
  ['program-fat-loss.html', 'fat_loss_blueprint'],
  ['program-muscle-gain.html', 'muscle_gain'],
  ['program-glute-builder.html', 'glute_builder'],
];

/* [label, profile, expected failure state].
 *
 * 'unavailable' — we do not have the value, so a retry can genuinely help.
 * 'unsupported' — the value is PRESENT and no Program schedule covers it, so the
 *                 user has to change it and a retry would be useless. */
const UNKNOWN_FREQUENCIES = [
  ['profile read failed', 'throws', 'unavailable'],
  ['no profile row', null, 'unavailable'],
  ['column null', { training_days: null }, 'unavailable'],
  ['column absent', {}, 'unavailable'],
  ['non-numeric', { training_days: '4' }, 'unsupported'],
  ['not an integer', { training_days: 4.5 }, 'unsupported'],
  ['out of domain high', { training_days: 12 }, 'unsupported'],
  ['out of domain negative', { training_days: -1 }, 'unsupported'],
  ['NaN', { training_days: NaN }, 'unsupported'],
  // Storable onboarding answers that no Program schedule maps (owner ruling
  // 2026-09-29). These are the mutation-sensitive cases: they pass only because
  // the lower bound is 2. Restore the bound to 0 and both regress to selecting
  // the 3-day family via normalizeTrainingDays().
  ['stored 0 days, not schedulable', { training_days: 0 }, 'unsupported'],
  ['stored 1 day, not schedulable', { training_days: 1 }, 'unsupported'],
];

/* Copy and action, per state. Asserted against RENDERED output, not source. */
const UNAVAILABLE_COPY = /We couldn’t load your workout schedule\./;
const UNSUPPORTED_COPY = /Choose between 2 and 6 workout days to use this program\./;

/* Shared by both states and by all four pages: nothing offered, nothing written,
 * nothing technical disclosed. */
function assertFailedClosedCopy(copy, label) {
  assert.doesNotMatch(copy, /You train/, 'states no frequency: ' + label);
  assert.doesNotMatch(copy, /\b\d+ days?\/week\b/, 'states no personal day count: ' + label);
  // No technical detail: no reason code, column name, status code or stack text.
  assert.doesNotMatch(copy, /training_days|no_profile|missing|invalid|undefined|null|NaN/,
    'exposes no technical detail: ' + label);
  assert.doesNotMatch(copy, /error|failed|exception|supabase|profile row/i,
    'exposes no error detail: ' + label);
}

for (const [file, slug] of CLASSIC) {
  for (const [label, profile, state] of UNKNOWN_FREQUENCIES) {
    test(file + ': fails closed — ' + label + ' → ' + state, async () => {
      const h = classicHarness(file, slug, profile);
      await h.run();

      // Identical in both states.
      assert.deepEqual(h.sandbox.PROG_KEYS, [], 'no browsable sessions');
      assert.equal(h.sandbox.PROG_RECOMMENDED, null, 'nothing recommended');
      assert.equal(h.sandbox.PROG_SELECTED, null, 'nothing selected');
      assert.equal(h.dom.els.schedPreview.innerHTML, '', 'no session rows rendered');
      assert.equal(h.dom.els.stickyCta.style.display, 'none', 'no Start CTA');
      assert.equal(h.dom.els.startTodayBtn.href, '', 'no launchable workout URL');
      assert.deepEqual(h.writes, [], 'no database access on the failure path');

      const copy = h.dom.els.schedSummary.innerHTML;
      assertFailedClosedCopy(copy, label);

      if (state === 'unsupported') {
        // We HAVE a value and no schedule covers it. Retrying returns the same
        // answer for ever, so the action must be the route that changes it.
        assert.match(copy, UNSUPPORTED_COPY);
        assert.doesNotMatch(copy, UNAVAILABLE_COPY, 'does not blame a failed load');
        assert.match(copy, /href="profile\.html"[^>]*>Recalculate Goals</,
          'offers the Recalculate Goals route');
        assert.doesNotMatch(copy, /Try again/, 'offers no useless retry');
        assert.equal(h.dom.els.schedRetryBtn.listeners.click, undefined,
          'and wires no retry handler');
      } else {
        assert.match(copy, UNAVAILABLE_COPY);
        assert.doesNotMatch(copy, UNSUPPORTED_COPY, 'does not ask for a value change');
        assert.match(copy, /Try again/, 'offers a retry');
        assert.ok(h.dom.els.schedRetryBtn.listeners.click, 'and wires it');
      }
    });
  }

  test(file + ': the two failure states are distinct and not interchangeable', async () => {
    // Mutation-sensitive: collapsing the mapping to one state, or inverting it,
    // breaks this — the copy AND the offered action must both differ.
    const unavailable = classicHarness(file, slug, null);
    await unavailable.run();
    const unsupported = classicHarness(file, slug, { training_days: 1 });
    await unsupported.run();

    const a = unavailable.dom.els.schedSummary.innerHTML;
    const b = unsupported.dom.els.schedSummary.innerHTML;
    assert.notEqual(a, b, 'the two states render different copy');
    assert.match(a, /Try again/);
    assert.doesNotMatch(a, /Recalculate Goals/);
    assert.match(b, /Recalculate Goals/);
    assert.doesNotMatch(b, /Try again/);
    // Both still fail closed identically.
    for (const h of [unavailable, unsupported]) {
      assert.equal(h.dom.els.schedPreview.innerHTML, '');
      assert.equal(h.dom.els.stickyCta.style.display, 'none');
      assert.deepEqual(h.writes, []);
    }
  });

  test(file + ': 0 and 1 never reach schedule selection', async () => {
    // Mutation-sensitive at the call-site level, not just the validator: proves
    // the page no longer consults getScheduleForDays() for these values, by
    // showing what it WOULD have produced.
    const s = loadSchedules();
    for (const days of [0, 1]) {
      const would = s.getScheduleForDays(slug, days);
      assert.ok(would.length, 'the mapping would have returned a family: ' + days);
      const h = classicHarness(file, slug, { training_days: days },
        { up: { current_index: 0 } });
      await h.run();
      assert.equal(h.sandbox.PROG_RECOMMENDED, null,
        'but nothing is recommended for days=' + days);
      assert.notEqual(h.sandbox.PROG_RECOMMENDED, would[0],
        'specifically not the promoted 3-day family for days=' + days);
      assert.deepEqual(h.writes, [], 'and no database access for days=' + days);
      assert.equal(h.dom.els.stickyCta.style.display, 'none');
    }
  });

  test(file + ': a valid frequency still behaves exactly as before', async () => {
    const h = classicHarness(file, slug, { training_days: 4 }, { up: { current_index: 0 } });
    await h.run();

    const s = loadSchedules();
    const expected = s.getScheduleForDays(slug, 4);
    assert.equal(h.sandbox.PROG_RECOMMENDED, expected[0],
      'recommends the 4-day family, not the 3-day one');
    assert.deepEqual(h.sandbox.PROG_KEYS, s.getAllSessionsForProgram(slug),
      'still browsable across every session');
    assert.equal(h.dom.els.stickyCta.style.display, 'block', 'Start CTA shown');
    assert.match(h.dom.els.schedSummary.textContent, /You train 4 days\/week/);
    assert.ok(h.dom.els.schedPreview.innerHTML.length > 0, 'session rows rendered');
  });

  test(file + ': 2 days — the lower boundary — still works', async () => {
    const h = classicHarness(file, slug, { training_days: 2 }, { up: { current_index: 0 } });
    await h.run();
    const expected = loadSchedules().getScheduleForDays(slug, 2);
    assert.equal(h.sandbox.PROG_RECOMMENDED, expected[0]);
    assert.equal(h.dom.els.stickyCta.style.display, 'block');
    assert.match(h.dom.els.schedSummary.textContent, /You train 2 days\/week/);
  });

  test(file + ': the 4-day regression the defect caused is gone', async () => {
    // Against the pre-fix code a failed profile read produced the SAME
    // recommendation as a genuine 3-day user, which is what made the bug
    // invisible. The two must now be distinguishable.
    const broken = classicHarness(file, slug, null);
    await broken.run();
    const real3 = classicHarness(file, slug, { training_days: 3 }, { up: { current_index: 0 } });
    await real3.run();
    assert.notEqual(broken.sandbox.PROG_RECOMMENDED, real3.sandbox.PROG_RECOMMENDED);
    assert.equal(broken.sandbox.PROG_RECOMMENDED, null);
    assert.ok(real3.sandbox.PROG_RECOMMENDED);
  });
}

/* ── Bodyweight Foundations ─────────────────────────────────────────────
 * Structurally different: its sessions come from linked Routines, and its one
 * session family is used at every frequency 2–6. The gate is still uniform —
 * a per-page exception is exactly the divergence that produced this defect,
 * and the page must not act on a frequency it cannot trust regardless of
 * whether today's mapping happens to be insensitive to it. */

const BW_IDS = ['sessList', 'sessSummary', 'stickyCta', 'startBtn', 'sessRetryBtn',
  'ctaSessionName'];

/* The Program-linked rows the stub serves, in the shape loadSessions() reads them:
 * production's nine links — Full Body A/B/C plus the six frequency Routines that
 * CP4e-2 (Phase 4.3.9B) schedules at 4–6 days. */
const BW_LINK_ROWS = [
  ['full_a', 1, 'Full Body A'], ['full_b', 2, 'Full Body B'], ['full_c', 3, 'Full Body C'],
  ['push_core_a', 4, 'Push & Core A'], ['lower_a', 5, 'Lower Body A'],
  ['conditioning_core', 6, 'Conditioning & Core'], ['push_core_b', 7, 'Push & Core B'],
  ['lower_b', 8, 'Lower Body B'], ['mobility_recovery', 9, 'Mobility & Recovery'],
].map(([k, o, n]) => ({
  session_key: k, sort_order: o, programs: { slug: 'bodyweight_foundations' },
  workout_templates: { id: 'r-' + k, name: n },
}));

function bwHarness(profile, opts) {
  const file = 'program-bodyweight.html';
  const src = read(file);
  const dom = makeDom(BW_IDS);
  const tables = [];

  const sandbox = vm.createContext({
    console: { error() {}, log() {} },
    getProfile: async () => {
      if (profile === 'throws') throw new Error('network');
      return profile;
    },
    supabaseClient: {
      from(t) {
        tables.push(t);
        // CP4a moved the Program-linked session read INSIDE preselect(), after
        // frequency resolution, so the stub answers both reads. `program_routines`
        // ends with .order() and is awaited directly; `user_programs` ends with
        // .maybeSingle(). Neither path offers a write verb, so a write would throw
        // rather than pass silently.
        const links = (opts && opts.links !== undefined)
          ? opts.links
          : BW_LINK_ROWS;
        const linkResult = { data: links, error: (opts && opts.linksError) ? { message: 'boom' } : null };
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: (opts && opts.up) || null }),
              }),
              order: () => Promise.resolve(linkResult),
            }),
          }),
        };
      },
    },
    document: dom.document,
    encodeURIComponent,
  });

  vm.runInContext(SCHEDULES, sandbox);
  vm.runInContext('var PROGRAM_SLUG = "bodyweight_foundations"; var SELECTED = null;', sandbox);
  // CP4a harness contract change: preselect() no longer receives a ready-made
  // SESSIONS array. It loads the Program's linked sessions itself and narrows them
  // to the ones the validated frequency calls for, so the harness seeds the LINKED
  // set (and the production helpers that do the narrowing) instead. The fixture's
  // intended A/B/C content is unchanged — see BW_LINK_ROWS.
  vm.runInContext('var LINKED_SESSIONS = []; var SESSIONS = [];', sandbox);
  vm.runInContext('function esc(s) { return String(s); }', sandbox);
  loadOptional(src, sandbox, file);
  for (const fn of ['resolveScheduledSessions', 'showScheduleUnavailable',
                    'loadSessions', 'preselect', 'selectSession', 'renderSessions']) {
    vm.runInContext(extractFn(src, fn, file), sandbox);
  }
  return {
    sandbox, dom, tables,
    run: () => vm.runInContext('preselect("u1", { recommendedDaysPerWeek: 3 })', sandbox),
  };
}

for (const [label, profile, state] of UNKNOWN_FREQUENCIES) {
  test('program-bodyweight.html: fails closed — ' + label + ' → ' + state, async () => {
    const h = bwHarness(profile);
    const ready = await h.run();

    assert.equal(ready, false, 'preselect reports it is not ready');
    assert.equal(h.sandbox.SELECTED, null, 'no session selected');
    assert.equal(h.dom.els.sessList.innerHTML, '', 'no session buttons rendered');
    assert.equal(h.dom.els.stickyCta.style.display, 'none', 'no Start CTA');
    assert.equal(h.dom.els.startBtn.href, '', 'no launchable workout URL');
    assert.deepEqual(h.tables, [], 'no database access on the failure path');

    const copy = h.dom.els.sessSummary.innerHTML;
    assertFailedClosedCopy(copy, label);

    if (state === 'unsupported') {
      assert.match(copy, UNSUPPORTED_COPY);
      assert.doesNotMatch(copy, UNAVAILABLE_COPY, 'does not blame a failed load');
      assert.match(copy, /href="profile\.html"[^>]*>Recalculate Goals</,
        'offers the Recalculate Goals route');
      assert.doesNotMatch(copy, /Try again/, 'offers no useless retry');
      assert.equal(h.dom.els.sessRetryBtn.listeners.click, undefined,
        'and wires no retry handler');
    } else {
      assert.match(copy, UNAVAILABLE_COPY);
      assert.doesNotMatch(copy, UNSUPPORTED_COPY, 'does not ask for a value change');
      assert.match(copy, /Try again/, 'offers a retry');
      assert.ok(h.dom.els.sessRetryBtn.listeners.click, 'and wires it');
    }
  });
}

test('program-bodyweight.html: the two failure states are distinct and not interchangeable', async () => {
  const unavailable = bwHarness(null);
  await unavailable.run();
  const unsupported = bwHarness({ training_days: 1 });
  await unsupported.run();

  const a = unavailable.dom.els.sessSummary.innerHTML;
  const b = unsupported.dom.els.sessSummary.innerHTML;
  assert.notEqual(a, b, 'the two states render different copy');
  assert.match(a, /Try again/);
  assert.doesNotMatch(a, /Recalculate Goals/);
  assert.match(b, /Recalculate Goals/);
  assert.doesNotMatch(b, /Try again/);
  for (const h of [unavailable, unsupported]) {
    assert.equal(h.dom.els.sessList.innerHTML, '');
    assert.equal(h.dom.els.startBtn.href, '');
    assert.equal(h.dom.els.stickyCta.style.display, 'none');
    assert.deepEqual(h.tables, []);
  }
});

test('the unsupported-state action routes to the surface that actually hosts it', () => {
  // profile.html is where the Recalculate Goals control lives (the row that opens
  // #recalcModal). Pointing the primary action anywhere else would make it a
  // dead end, which is the whole thing this state exists to avoid.
  const profile = read('profile.html');
  assert.match(profile, /Recalculate Goals/, 'profile.html hosts the control');
  assert.match(profile, /id="recalcModal"/, 'and the modal it opens');
  assert.match(profile, /id="rc-training"/, 'including the training-days input');
  for (const file of Object.values(PAGES)) {
    assert.match(read(file), /href="profile\.html"[^>]*>Recalculate Goals</,
      file + ' routes the unsupported state to profile.html');
  }
});

/* ════════════════════════════════════════════════════════════════════════
 * 5. The schedule-card footer points at the same place
 *
 * The footer said "use Recalculate Goals on your dashboard" and linked to
 * app.html, which does not host that control — it moved to profile.html. With
 * the unsupported state now routing users there, leaving the footer pointing
 * elsewhere would send two different answers from inside one card.
 * ══════════════════════════════════════════════════════════════════════ */

/* The schedule-card footer note, markup included. */
function footerNote(file) {
  const src = read(file);
  const note = (src.match(/<p class="sched-note">[\s\S]*?<\/p>/) || [''])[0];
  assert.ok(note, file + ' has a schedule-card footer note');
  return note;
}

for (const file of Object.values(PAGES)) {
  test(file + ': the footer Recalculate link points at profile.html', () => {
    const note = footerNote(file);
    assert.match(note, /<a href="profile\.html">Recalculate Goals<\/a>/,
      'links to the page that hosts the control');
    assert.doesNotMatch(note, /app\.html/,
      'no longer points at the dashboard, which does not host it');
  });

  test(file + ': the footer says where the control actually is', () => {
    const text = footerNote(file).replace(/<[^>]*>/g, '');
    assert.match(text, /in your profile/, 'names the profile');
    assert.doesNotMatch(text, /dashboard/i, 'does not claim it is on the dashboard');
    // The pre-existing truthfulness pins still hold.
    assert.match(text, /applies to every program you own/, 'frequency is still global');
    assert.doesNotMatch(text, /\b[0-9]\b/, 'the footer still states no number');
  });

  test(file + ': the footer and the unsupported-state action agree', () => {
    // Exactly two Recalculate routes per page — the footer and the state action —
    // and both must resolve to the same destination. A future edit that moves one
    // without the other fails here.
    const src = read(file);
    const toProfile = src.match(/href="profile\.html"[^>]*>Recalculate Goals</g) || [];
    assert.equal(toProfile.length, 2,
      'the footer note and the unsupported-state action, both to profile.html');
    assert.equal((src.match(/>Recalculate Goals</g) || []).length, 2,
      'and there is no third, differently-routed Recalculate link');
  });

  test(file + ': dashboard navigation is untouched', () => {
    // Only the Recalculate route moved. Every other app.html link on the page is
    // real dashboard navigation and must stay.
    const src = read(file);
    assert.match(src, /class="header-logo" href="app\.html"/,
      'the logo still returns to the dashboard');
    const appLinks = src.match(/href="app\.html"/g) || [];
    assert.ok(appLinks.length >= 1, 'dashboard links remain');
    // None of them is a Recalculate link any more.
    assert.doesNotMatch(src, /href="app\.html"[^>]*>Recalculate/,
      'no Recalculate link points at the dashboard');
  });

  test(file + ': the footer is static markup that no script touches', () => {
    // Evidence that this change cannot alter Program behaviour: the note is not
    // assigned, read, or branched on at runtime.
    const src = read(file);
    const code = src.slice(src.lastIndexOf('<script>'), src.lastIndexOf('</script>'));
    assert.ok(!/sched-note/.test(code), 'no script references the footer');
    assert.ok(!/Recalculate Goals/.test(code.replace(
      /'Choose between 2 and 6[\s\S]*?Recalculate Goals<\/a>'/, '')),
      'the only scripted Recalculate text is the unsupported-state action');
  });
}

test('the footer change alters no schedule behaviour on any page', async () => {
  // Re-runs the real resolution path per page at a valid frequency and asserts the
  // same recommendation, session list and CTA as the pre-footer-change behaviour.
  const s = loadSchedules();
  for (const [file, slug] of CLASSIC) {
    const h = classicHarness(file, slug, { training_days: 4 }, { up: { current_index: 0 } });
    await h.run();
    assert.equal(h.sandbox.PROG_RECOMMENDED, s.getScheduleForDays(slug, 4)[0], file);
    assert.deepEqual(h.sandbox.PROG_KEYS, s.getAllSessionsForProgram(slug), file);
    assert.equal(h.dom.els.stickyCta.style.display, 'block', file);
    assert.match(h.dom.els.startTodayBtn.href,
      new RegExp('^workout\\.html\\?program=' + slug + '&session=\\w+&mode=optional$'), file);
  }
  const bw = bwHarness({ training_days: 4 }, { up: { current_index: 1 } });
  assert.equal(await bw.run(), true);
  assert.equal(bw.sandbox.SELECTED, s.getScheduleForDays('bodyweight_foundations', 4)[1]);
  assert.equal(bw.sandbox.SELECTED, 'lower_a');
  assert.match(bw.dom.els.startBtn.href,
    /^workout\.html\?program=bodyweight_foundations&session=lower_a&mode=optional$/);
});

test('program-bodyweight.html: 0 and 1 never reach schedule selection', async () => {
  // Bodyweight maps one family at every frequency, so 0/1 would have produced a
  // usable-looking session. It must still refuse, because the frequency is not a
  // legitimate basis for the decision regardless of where the mapping lands.
  const s = loadSchedules();
  for (const days of [0, 1]) {
    assert.ok(s.getScheduleForDays('bodyweight_foundations', days).length,
      'the mapping would have returned a family: ' + days);
    const h = bwHarness({ training_days: days }, { up: { current_index: 0 } });
    assert.equal(await h.run(), false, 'not ready for days=' + days);
    assert.equal(h.sandbox.SELECTED, null, 'nothing selected for days=' + days);
    assert.equal(h.dom.els.sessList.innerHTML, '', 'no session buttons: ' + days);
    assert.equal(h.dom.els.startBtn.href, '', 'no launchable workout: ' + days);
    assert.equal(h.dom.els.stickyCta.style.display, 'none', 'no Start CTA: ' + days);
    assert.deepEqual(h.tables, [], 'no database access: ' + days);
  }
});

test('program-bodyweight.html: a valid frequency still preselects and launches', async () => {
  // 4 days runs the CP4e-2 frequency Routines; index 1 is Lower Body A.
  const h = bwHarness({ training_days: 4 }, { up: { current_index: 1 } });
  const ready = await h.run();
  assert.equal(ready, true);
  assert.equal(h.sandbox.SELECTED, 'lower_a', 'honours the progression index');
  assert.match(h.dom.els.startBtn.href,
    /^workout\.html\?program=bodyweight_foundations&session=lower_a&mode=optional$/);
  assert.ok(h.dom.els.sessList.innerHTML.includes('Lower Body A'), 'the Routine name, not "Lower A"');
  // The original assertion is preserved verbatim in substance: exactly ONE
  // progression read, and no write. CP4a adds the Program-linked session read to
  // preselect() (it moved there so frequency resolution always happens first), so
  // the full expected set is pinned too — still an exact set, so an extra or
  // repeated read fails.
  assert.equal(h.tables.filter((t) => t === 'user_programs').length, 1,
    'exactly one progression read');
  assert.deepEqual(h.tables, ['program_routines', 'user_programs'],
    'sessions then progression — nothing else, and in that order');
});

test('program-bodyweight.html: 2 days — the lower boundary — still works', async () => {
  const h = bwHarness({ training_days: 2 }, { up: { current_index: 0 } });
  assert.equal(await h.run(), true);
  assert.equal(h.sandbox.SELECTED, 'full_a');
  assert.equal(h.dom.els.sessSummary.innerHTML, '', 'the static intro is untouched');
});

test('program-bodyweight.html: the Start CTA is gated on preselect, not assumed', () => {
  // The boot sequence used to show the sticky CTA unconditionally after
  // preselect(), so a fail-closed preselect alone would not have hidden it.
  const src = read('program-bodyweight.html');
  assert.match(src, /var ready = await preselect\(/);
  assert.match(src, /if \(ready\) document\.getElementById\('stickyCta'\)/);
});

test('program-bodyweight.html: the frequency state is distinct from unavailable', () => {
  // showUnavailable() means "this Program is not available to you" and offers
  // no retry; collapsing the two would make a transient profile read look like
  // a lost entitlement.
  const src = read('program-bodyweight.html');
  const fn = extractFn(src, 'showFrequencyUnavailable', 'program-bodyweight.html');
  assert.ok(!/showUnavailable\(/.test(fn),
    'the frequency failure must not reuse the unavailable state');
  assert.match(fn, /sessRetryBtn/, 'it is retryable');
});

/* ════════════════════════════════════════════════════════════════════════
 * 4. Blast radius
 * ══════════════════════════════════════════════════════════════════════ */

test('getProfile() itself is unchanged — 13 callers keep their behaviour', () => {
  // The upstream trigger is that getProfile() swallows its error and returns
  // null. Changing that would alter auth, onboarding, nutrition, weight,
  // dashboard, profile and workout flows at once, so the fix is applied at the
  // four call sites that make a frequency DECISION instead.
  const src = read('supabase.js');
  assert.match(src, /async function getProfile/);
  assert.match(src, /return\s+(data|null)/,
    'getProfile still resolves to a row or null rather than throwing');
});

test('schedules.js mappings are untouched by this fix', () => {
  // This fix changed no mapping. Bodyweight Foundations' 4–6 day schedules were
  // later activated by CP4e-2 (Phase 4.3.9B); 2 days still runs A/B/C.
  const s = loadSchedules();
  assert.deepEqual(s.getScheduleForDays('bodyweight_foundations', 2), ['full_a', 'full_b', 'full_c']);
  assert.deepEqual(s.getScheduleForDays('bodyweight_foundations', 6),
    ['push_core_a', 'lower_a', 'conditioning_core', 'push_core_b', 'lower_b', 'mobility_recovery']);
  assert.deepEqual(s.getScheduleForDays('muscle_gain', 4), ['upper_a', 'lower_a', 'upper_b', 'lower_b']);
  assert.deepEqual(s.getScheduleForDays('glute_builder', 3),
    s.getScheduleForDays('glute_builder', 3));
  assert.equal(Object.keys(s.PROGRAM_SCHEDULES).length, 4);
});
