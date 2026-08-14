// mm-errors.test.js — Phase 4.3.5J contract for client error reporting.
//
// Error reporting is the one feature where being useful and being safe pull
// directly against each other: the more context a report carries the easier the
// bug is to fix, and the more likely it is to carry something that must never
// leave the device. So the privacy assertions here are exhaustive and specific
// — each one names a real value shape this app actually handles — and the
// noise assertions are just as strict, because a reporter that floods a
// Hobby-plan function budget gets turned off and then protects nothing.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MMErrors = require('./mm-errors.js');
const route = require('./api/client-error.js');
const { normalize } = route._internals;

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('mm-errors.js');
const ROUTE_SRC = read('api/client-error.js');

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · Privacy — what must never leave the device
 * ══════════════════════════════════════════════════════════════════════ */

test('privacy: a Supabase session token is never sent', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const out = MMErrors.sanitize('Request failed with token ' + jwt);
  assert.ok(!out.includes(jwt), 'the JWT itself is gone');
  assert.ok(!out.includes('eyJ'), 'not even the recognisable prefix survives');
  assert.match(out, /\[token\]|\[redacted\]/, 'and the fact of a token is preserved');
});

test('privacy: api keys and bearer headers are stripped', () => {
  for (const s of [
    'Authorization: Bearer sk-abc123def456',
    'apikey=sb_publishable_LzaTBAZzmu1EOO6MsTSiFA_2BdMq9j6',
    'access_token: abcdef123456',
  ]) {
    const out = MMErrors.sanitize(s);
    assert.ok(!/sk-abc123def456|sb_publishable_LzaTBAZzmu|abcdef123456/.test(out),
      `secret survived sanitisation of "${s}" -> "${out}"`);
  }
});

test('privacy: an e-mail address is never sent', () => {
  const out = MMErrors.sanitize('signIn failed for nettletoneffi@gmail.com');
  assert.ok(!out.includes('nettletoneffi'), 'local part removed');
  assert.ok(!out.includes('gmail.com'), 'domain removed');
  assert.match(out, /\[email\]/);
});

test('privacy: user and record ids are never sent', () => {
  const out = MMErrors.sanitize('insert into food_logs failed for 3f740fb4-f346-4b6d-9e15-a4e5718f4a91');
  assert.ok(!/3f740fb4/.test(out));
  assert.match(out, /\[id\]/);
});

test('privacy: a query string carried in a message is dropped whole', () => {
  // This is where dates, workout ids and food ids actually travel.
  const out = MMErrors.sanitize("failed loading /workout-complete.html?workout_id=abc&date=2026-08-14");
  assert.ok(!out.includes('workout_id'));
  assert.ok(!out.includes('2026-08-14'));
});

test('privacy: the route is a file name, never a URL with parameters', () => {
  assert.strictEqual(MMErrors.routeOf('/workout-complete.html?workout_id=abc'), 'workout-complete.html');
  assert.strictEqual(MMErrors.routeOf('/nutrition.html#quicklog'), 'nutrition.html');
  assert.strictEqual(MMErrors.routeOf('/'), 'index.html');
  assert.strictEqual(MMErrors.routeOf(null), 'unknown');
});

test('privacy: a stack keeps only same-origin frames, reduced to file:line', () => {
  const stack = [
    'TypeError: x is not a function',
    '    at nuSave (https://musclemotivation.fit/nutrition.js?v=2:366:11)',
    '    at Object.createClient (https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js:1:22)',
    '    at HTMLButtonElement.<anonymous> (https://musclemotivation.fit/nutrition.html:1200:5)',
  ].join('\n');
  const frames = MMErrors.sanitizeStack(stack, 'https://musclemotivation.fit');
  assert.strictEqual(frames.length, 2, 'the cross-origin CDN frame is dropped');
  assert.ok(frames.every((f) => !f.includes('musclemotivation.fit')), 'no origin in any frame');
  assert.ok(frames.every((f) => !f.includes('?')), 'no query string in any frame');
  assert.match(frames[0], /nuSave nutrition\.js:366:11/);
});

test('privacy: no report field can carry nutrition, workout or body data', () => {
  // The report shape is closed — everything is derived, nothing passes through.
  const r = MMErrors.buildReport({
    kind: 'api', error: new Error('boom'), pathname: '/nutrition.html',
    origin: 'https://x', session: 'abc', at: 1,
    // Fields a careless caller might try to attach:
    calories: 2400, foodName: 'chicken breast', weight: 213, userId: 'u1',
  });
  assert.deepStrictEqual(Object.keys(r).sort(),
    ['at', 'fp', 'frames', 'kind', 'message', 'name', 'route', 'session', 'v']);
  assert.ok(!JSON.stringify(r).includes('chicken'));
  assert.ok(!JSON.stringify(r).includes('2400'));
});

test('privacy: the session id is ephemeral and not derived from the user', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  assert.match(code, /sessionId = Math\.random\(\)\.toString\(36\)/);
  for (const forbidden of [/localStorage/, /sessionStorage/, /\bcookie\b/, /user\.id/, /getSession/]) {
    assert.ok(!forbidden.test(code), `mm-errors.js must not reference ${forbidden}`);
  }
});

test('privacy: reports are sent without credentials', () => {
  assert.match(SRC, /credentials: 'omit'/,
    'the endpoint neither needs nor should receive the session cookie');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Noise — one broken loop must not become a thousand reports
 * ══════════════════════════════════════════════════════════════════════ */

const st = () => ({ sent: {}, count: 0 });

test('noise: the same failure is reported once, not once per occurrence', () => {
  const s = st();
  const r = { fp: 'same' };
  assert.strictEqual(MMErrors.shouldSend(r, s).send, true);
  s.sent[r.fp] = true; s.count++;
  assert.deepStrictEqual(MMErrors.shouldSend(r, s), { send: false, reason: 'duplicate' });
});

test('noise: a hard per-page cap bounds the worst case', () => {
  const s = st();
  for (let i = 0; i < MMErrors.LIMITS.maxPerPage; i++) {
    const r = { fp: 'e' + i };
    assert.strictEqual(MMErrors.shouldSend(r, s).send, true, `report ${i} is sent`);
    s.sent[r.fp] = true; s.count++;
  }
  assert.deepStrictEqual(MMErrors.shouldSend({ fp: 'one-too-many' }, s),
    { send: false, reason: 'capped' });
});

test('noise: the fingerprint groups genuinely identical failures', () => {
  const base = { kind: 'unhandled-error', name: 'TypeError', message: 'x is not a function',
    route: 'nutrition.html', frames: ['nuSave nutrition.js:366:11'] };
  // Same failure, different column — one fingerprint.
  const other = { ...base, frames: ['nuSave nutrition.js:366:44'] };
  assert.strictEqual(MMErrors.fingerprint(base), MMErrors.fingerprint(other));
  // A different file is a different bug.
  assert.notStrictEqual(MMErrors.fingerprint(base),
    MMErrors.fingerprint({ ...base, frames: ['wlSave weight.js:313:9'] }));
  // …and so is the same error on a different page.
  assert.notStrictEqual(MMErrors.fingerprint(base),
    MMErrors.fingerprint({ ...base, route: 'workout.html' }));
});

test('noise: a malformed report is dropped rather than sent', () => {
  assert.strictEqual(MMErrors.shouldSend(null, st()).send, false);
  assert.strictEqual(MMErrors.shouldSend({}, st()).send, false);
  assert.strictEqual(MMErrors.shouldSend({ fp: 'x' }, null).send, false);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Signal — expected outcomes are not faults
 * ══════════════════════════════════════════════════════════════════════ */

test('signal: user-correctable outcomes are never reported as failures', () => {
  // A rejected weight, an empty search, a cancelled scan — the product working.
  assert.strictEqual(MMErrors.isReportable('expected'), false);
  assert.strictEqual(MMErrors.isReportable('info'), false);
  assert.strictEqual(MMErrors.isReportable('error'), true);
  assert.strictEqual(MMErrors.isReportable(undefined), true, 'unclassified defaults to a fault');
});

test('signal: a failed CDN script is captured as a resource failure, not a crash', () => {
  assert.match(SRC, /if \(tag === 'script' \|\| tag === 'link'\)/);
  assert.match(SRC, /report\('resource', null,/);
});

test('signal: both unhandled channels are covered', () => {
  assert.match(SRC, /win\.addEventListener\('error'/);
  assert.match(SRC, /win\.addEventListener\('unhandledrejection'/);
  // A rejection with a non-Error reason still produces something readable.
  assert.match(SRC, /String\(r && r\.message \? r\.message : r\)/);
});

test('signal: the reporter can never become the failure', () => {
  assert.match(SRC, /\/\/ A failure inside the error reporter must never become a second error\.\s*\n\s*return false;/);
  assert.match(SRC, /\.catch\(function \(\) \{ \/\* reporting must never surface its own failure \*\/ \}\)/);
});

test('signal: a report survives the page being torn down', () => {
  // A navigation-time failure is exactly the kind we would otherwise never see.
  assert.match(SRC, /win\.navigator\.sendBeacon\(LIMITS\.endpoint, blob\)/);
  assert.match(SRC, /keepalive: true/, 'and the fetch fallback does too');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · The endpoint
 * ══════════════════════════════════════════════════════════════════════ */

test('endpoint: it re-validates rather than trusting the client', () => {
  const out = normalize({
    kind: 'x'.repeat(500), name: 'y'.repeat(500), message: 'z'.repeat(5000),
    frames: Array(50).fill('f'.repeat(500)), route: 'r'.repeat(500),
  });
  assert.ok(out.kind.length <= route._internals.MAX_NAME);
  assert.ok(out.message.length <= route._internals.MAX_MESSAGE);
  assert.ok(out.frames.length <= route._internals.MAX_FRAMES);
  for (const f of out.frames) assert.ok(f.length <= route._internals.MAX_FRAME);
});

test('endpoint: unknown fields are dropped, never logged', () => {
  const out = normalize({
    message: 'boom',
    token: 'SECRET', cookie: 'session=abc', userId: 'u1', calories: 2400,
  });
  assert.deepStrictEqual(Object.keys(out).sort(),
    ['fp', 'frames', 'kind', 'message', 'name', 'route', 'session', 'v']);
  assert.ok(!JSON.stringify(out).includes('SECRET'));
});

test('endpoint: junk is rejected without a log line', () => {
  assert.strictEqual(normalize(null), null);
  assert.strictEqual(normalize('a string'), null);
  assert.strictEqual(normalize([1, 2, 3]), null);
  assert.strictEqual(normalize({}), null, 'nothing to say → nothing logged');
  assert.strictEqual(normalize({ kind: 'x' }), null, 'no message and no stack → dropped');
});

test('endpoint: it writes to nothing but the log', () => {
  for (const forbidden of [/supabase/i, /apply_migration/, /\bINSERT\b/i, /createClient/,
    /SERVICE_ROLE/, /process\.env/]) {
    assert.ok(!forbidden.test(ROUTE_SRC), `client-error.js must not reference ${forbidden}`);
  }
  assert.match(ROUTE_SRC, /console\.error\('\[mm-client-error\] ' \+ JSON\.stringify\(report\)\)/);
});

test('endpoint: only POST is accepted, and the body is capped', () => {
  assert.match(ROUTE_SRC, /if \(req\.method !== 'POST'\)/);
  assert.match(ROUTE_SRC, /Buffer\.byteLength\(body, 'utf8'\) > MAX_BODY_BYTES/);
  assert.strictEqual(route._internals.MAX_BODY_BYTES, 2048);
});

test('endpoint: it matches the CommonJS convention of every other route', () => {
  assert.match(ROUTE_SRC, /module\.exports = async \(req, res\) => \{/);
  assert.match(ROUTE_SRC, /module\.exports\._internals = \{/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · Coverage and constraints
 * ══════════════════════════════════════════════════════════════════════ */

test('coverage: every reachable page installs the reporter', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  for (const p of pages) {
    // calculator.html is never modified (CLAUDE.md §3) — a standing exception.
    if (p === 'calculator.html') continue;
    assert.match(read(p), /<script src="mm-errors\.js" defer><\/script>/,
      `${p} installs the error reporter`);
  }
});

test('coverage: calculator.html was not touched', () => {
  assert.ok(!/mm-errors\.js|mm-sheet\.js|mm-dirty\.js|mm-menu\.js/.test(read('calculator.html')),
    'calculator.html must never be modified');
});

test('constraints: the endpoint is same-origin, so the CSP already allows it', () => {
  assert.strictEqual(MMErrors.LIMITS.endpoint, '/api/client-error');
  const csp = JSON.parse(read('vercel.json')).headers[0].headers
    .find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src 'self'/, "same-origin POST needs no CSP change");
});

test('constraints: no new vendor, account or secret was introduced', () => {
  // The brief is explicit: an external monitoring provider needs approval, so
  // this ships on existing infrastructure only and records the recommendation.
  assert.ok(!/sentry|bugsnag|datadog|rollbar|logrocket|newrelic/i.test(SRC + ROUTE_SRC),
    'no third-party monitoring SDK');
  assert.ok(!/https?:\/\//.test(MMErrors.LIMITS.endpoint), 'reports never leave the origin');
  assert.match(SRC, /RECOMMENDATION REQUIRING APPROVAL/,
    'the deferred vendor recommendation is documented in the module');
});
