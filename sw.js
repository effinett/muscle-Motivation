/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Service Worker (Phase 4.3.2, Checkpoint 2)
 *
 * Thin, root-scoped service-worker entrypoint. It loads the approved policy
 * (`sw-policy.js`, the single source of truth for the static allowlist, cache
 * naming, and request eligibility) and the deterministic runtime logic
 * (`sw-runtime.js`), then wires the REAL worker globals into the runtime via
 * dependency injection and registers the lifecycle listeners.
 *
 * IMPORTANT: this worker is NOT registered by any page in Checkpoint 2. Nothing
 * loads or installs it, so it has zero production effect. Registration and the
 * user-controlled update flow are Checkpoint 3.
 *
 * This file contains NO cache policy of its own: no allowlist, no cache prefix,
 * no current-cache name, no request classification. It only injects globals and
 * attaches handlers. `self.skipWaiting()` is exposed solely as an injected
 * dependency invoked by the runtime's `{type:'SKIP_WAITING'}` message path —
 * never at install time.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';

importScripts('/sw-policy.js');
importScripts('/sw-runtime.js');

(function () {
  'use strict';

  var policy = self.SWPolicy;
  var runtime = self.SWRuntime;

  // Fail safe: if the policy or runtime failed to load, or the policy contract
  // is incomplete, attach NO listeners. The worker stays inert and the browser's
  // ordinary network pipeline handles every request unchanged.
  if (!runtime || typeof runtime.createRuntime !== 'function' ||
      typeof runtime.validatePolicy !== 'function' || !runtime.validatePolicy(policy)) {
    return;
  }

  var app = runtime.createRuntime({
    policy: policy,
    caches: self.caches,
    fetch: function (request) { return fetch(request); },
    // Injected controlled-refresh hook — reached ONLY via the SKIP_WAITING
    // message handler inside the runtime, never during install.
    skipWaiting: function () { return self.skipWaiting(); },
    origin: self.location.origin
  });

  self.addEventListener('install', app.onInstall);
  self.addEventListener('activate', app.onActivate);
  self.addEventListener('fetch', app.onFetch);
  self.addEventListener('message', app.onMessage);
})();
