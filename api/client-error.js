// /api/client-error.js
// Phase 4.3.5J — the sink for browser-side error reports from mm-errors.js.
//
// WHAT THIS IS. The smallest thing that turns invisible client failures into
// something we can actually read, using ONLY infrastructure that already
// exists: it validates a report and writes one line to stdout, which the
// platform's runtime logs already capture and which is already the documented
// way this project diagnoses production problems (CLAUDE.md §9).
//
// WHAT THIS DELIBERATELY IS NOT.
//   • It writes to NO database. No table, no migration, no schema change.
//   • It calls no third party and needs no new account, vendor or secret.
//   • It stores nothing and returns nothing. There is no read path, so nothing
//     here can ever expose one user's data to another.
//
// WHY IT IS UNAUTHENTICATED. The failures most worth seeing are the ones that
// happen BEFORE or DURING auth — a bootstrap crash, a broken session, a script
// that failed to load. Requiring a token would blind us to exactly those. The
// exposure that buys is bounded deliberately: POST only, a hard body cap, a
// strict allow-list schema, no amplification, no storage and no fan-out, so the
// worst an abuser achieves is log noise. That trade is recorded rather than
// assumed, and a rate-limited or authenticated variant is the obvious upgrade
// if it is ever exercised.
//
// PRIVACY. The client sanitises before sending (mm-errors.js), and this route
// does NOT trust that: it re-clamps every field, keeps only the allow-listed
// keys, and drops everything else. It never logs headers, cookies, the client
// IP, or any field it was not explicitly told to keep.

const MAX_BODY_BYTES = 2048;   // a report is ~400 bytes; this is generous
const MAX_MESSAGE = 300;
const MAX_NAME = 60;
const MAX_FRAMES = 5;
const MAX_FRAME = 160;
const MAX_KIND = 32;
const MAX_ROUTE = 64;
const MAX_SESSION = 16;
const MAX_FP = 200;

const clamp = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

// Keep ONLY the fields we asked for, each clamped. Anything else a caller
// invents — extra keys, nested objects, arrays of the wrong shape — is dropped
// rather than logged, so this route can never become a general-purpose sink.
function normalize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const frames = Array.isArray(body.frames)
    ? body.frames.filter((f) => typeof f === 'string').slice(0, MAX_FRAMES).map((f) => clamp(f, MAX_FRAME))
    : [];

  const out = {
    v: 1,
    kind: clamp(body.kind, MAX_KIND) || 'error',
    name: clamp(body.name, MAX_NAME) || 'Error',
    message: clamp(body.message, MAX_MESSAGE),
    frames,
    route: clamp(body.route, MAX_ROUTE) || 'unknown',
    session: clamp(body.session, MAX_SESSION),
    fp: clamp(body.fp, MAX_FP),
  };
  // A report with no message and no stack says nothing worth a log line.
  if (!out.message && frames.length === 0) return null;
  return out;
}

// CommonJS, matching every other route in this directory.
module.exports = async (req, res) => {
  // Reporting must never slow the page down or surface its own failure, so
  // every path answers 204 and nothing here can throw into the response.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;

    // sendBeacon posts a Blob, so depending on the runtime the body may arrive
    // as a string or a Buffer rather than parsed JSON.
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') {
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return res.status(204).end();
      try { body = JSON.parse(body); } catch { return res.status(204).end(); }
    }

    const report = normalize(body);
    if (!report) return res.status(204).end();

    // ONE structured line, which is what makes it greppable in runtime logs.
    // Nothing about the request itself is included — no headers, no cookies,
    // no IP, no user agent.
    console.error('[mm-client-error] ' + JSON.stringify(report));
  } catch {
    // Contained: a bad report is never worth a 500 back to a page that is
    // already broken.
  }

  return res.status(204).end();
};

// Exposed for tests, in the same shape the other routes use.
module.exports._internals = {
  normalize,
  MAX_BODY_BYTES, MAX_MESSAGE, MAX_NAME, MAX_FRAMES, MAX_FRAME,
};
