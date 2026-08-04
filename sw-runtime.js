/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Service-Worker Runtime Logic (Phase 4.3.2, Checkpoint 2)
 *
 * The deterministic, testable core of the service worker. `sw.js` is a thin
 * entrypoint that loads `sw-policy.js` + this file and wires the REAL worker
 * globals (`self.caches`, `fetch`, `self.skipWaiting`, `self.location.origin`)
 * into `createRuntime(deps)` via dependency injection. Node tests import this
 * module directly and inject fakes — no bundler, no browser, no packages.
 *
 * This file NEVER hard-codes the allowlist, cache prefix, current cache name,
 * or request-classification logic — `sw-policy.js` is the single source of
 * truth, reached only through the injected `deps.policy`.
 *
 * Safety posture (all enforced here):
 *   • install: open ONLY the current static cache, addAll the exact approved
 *     allowlist, all-or-nothing (partial cache never activates). No skipWaiting,
 *     no cache deletion, no runtime/API/HTML/data caches.
 *   • activate: delete ONLY obsolete owned (`mm-static-*`) caches, never the
 *     current one, never any unrelated cache. No clients.claim, no unregister,
 *     touches nothing outside Cache Storage.
 *   • fetch: DEFAULT PASS-THROUGH. respondWith is called ONLY for a request the
 *     policy approves (same-origin GET, no auth header, exact allowlisted path).
 *     Everything else — navigation/HTML, /api, Supabase, cross-origin, CDN,
 *     fonts, auth-bearing, non-GET, unknown — is left to the browser untouched.
 *     Classification errors fail CLOSED (no interception).
 *   • message: only `{type:'SKIP_WAITING'}` triggers the injected skipWaiting
 *     (the future controlled-refresh hook). Everything else is ignored.
 *
 * Exposed as `SWRuntime` on the global (worker/browser) and `module.exports`
 * (Node tests).
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // Validate the injected policy contract. Missing policy or any missing / wrong
  // member → false, so callers can fail closed (attach no handlers / never
  // intercept) rather than dereferencing an absent member.
  function validatePolicy(policy) {
    if (!policy || typeof policy !== 'object') return false;
    if (typeof policy.CACHE_PREFIX !== 'string' || policy.CACHE_PREFIX.length === 0) return false;
    if (typeof policy.CURRENT_STATIC_CACHE !== 'string' || policy.CURRENT_STATIC_CACHE.length === 0) return false;
    if (!Array.isArray(policy.STATIC_ALLOWLIST)) return false;
    if (typeof policy.isOwnedCacheName !== 'function') return false;
    if (typeof policy.isCacheableRequest !== 'function') return false;
    if (typeof policy.isNavigationRequest !== 'function') return false;
    return true;
  }

  // The owned caches that activation should delete: owned by the policy prefix
  // AND not the current static cache. Never returns unrelated / current names.
  function obsoleteOwnedCaches(names, policy) {
    if (!Array.isArray(names)) return [];
    if (!policy || typeof policy.isOwnedCacheName !== 'function') return [];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (policy.isOwnedCacheName(n) && n !== policy.CURRENT_STATIC_CACHE) out.push(n);
    }
    return out;
  }

  // Whether a network response is safe to write into the static cache. Rejects
  // non-OK, opaque, opaque-redirect, redirected, and 206 partial responses.
  function isCacheableResponse(response) {
    if (!response || typeof response !== 'object') return false;
    if (response.type === 'opaque' || response.type === 'opaqueredirect') return false;
    if (response.redirected === true) return false;
    if (response.status === 206) return false;
    return response.ok === true; // ok === true implies a 200–299 status
  }

  // Does the request carry an Authorization header? Unknown / unreadable headers
  // fail CLOSED to `true` (treated as auth-bearing → policy denies caching).
  function requestHasAuthorization(request) {
    try {
      var h = request && request.headers;
      if (h && typeof h.has === 'function') return h.has('Authorization') === true;
    } catch (e) { /* fall through */ }
    return true;
  }

  function createRuntime(deps) {
    deps = deps || {};
    var policy = deps.policy;
    var caches = deps.caches;
    var doFetch = deps.fetch;
    var doSkipWaiting = deps.skipWaiting;
    var origin = deps.origin;

    // ── preview-only diagnostics ─────────────────────────────────────────────
    // Console-only, fixed event names, no payloads/URLs/user data. Enabled ONLY
    // on localhost or a *.vercel.app preview origin — NEVER on the production apex.
    var DIAG_LOCAL = { localhost: 1, '127.0.0.1': 1, '[::1]': 1 };
    function diagEligible(o) {
      try {
        var h = new URL(o).hostname;
        return DIAG_LOCAL[h] === 1 || /\.vercel\.app$/.test(h);
      } catch (e) { return false; }
    }
    var diagOn = diagEligible(origin);
    var diagCon = deps.console || (typeof console !== 'undefined' ? console : null);
    function diag(evt) {
      if (!diagOn) return;
      try { if (diagCon && typeof diagCon.log === 'function') diagCon.log('[MM SW WORKER] ' + evt); } catch (e) {}
    }

    // Contained response delivery: a missing / throwing port is safe.
    function postResponse(port, message) {
      try {
        if (port && typeof port.postMessage === 'function') { port.postMessage(message); return true; }
      } catch (e) { /* contained */ }
      return false;
    }

    // ── install ────────────────────────────────────────────────────────────
    // Open ONLY the current static cache and addAll the exact approved list.
    // addAll is all-or-nothing: any failed entry rejects the whole install, so a
    // partially-populated cache never activates. No skipWaiting, no deletion.
    function onInstall(event) {
      event.waitUntil(
        Promise.resolve()
          .then(function () { return caches.open(policy.CURRENT_STATIC_CACHE); })
          .then(function (cache) { return cache.addAll(policy.STATIC_ALLOWLIST.slice()); })
      );
    }

    // ── activate ─────────────────────────────────────────────────────────────
    // Delete ONLY obsolete owned caches. A deletion rejection rejects activation
    // (cleanup is never silently reported as done). No clients.claim, no
    // unregister, nothing outside Cache Storage.
    function onActivate(event) {
      event.waitUntil(
        Promise.resolve()
          .then(function () { return caches.keys(); })
          .then(function (names) {
            var obsolete = obsoleteOwnedCaches(names, policy);
            return Promise.all(obsolete.map(function (name) { return caches.delete(name); }));
          })
      );
    }

    // ── fetch ────────────────────────────────────────────────────────────────
    // Default pass-through. Only a policy-approved request is intercepted.
    function onFetch(event) {
      var request = event && event.request;
      var eligible = false;
      try {
        if (!validatePolicy(policy)) return;            // missing policy → never intercept
        if (!request || typeof request.url !== 'string') return;
        eligible = policy.isCacheableRequest({
          url: request.url,
          method: request.method,
          appOrigin: origin,
          hasAuthorizationHeader: requestHasAuthorization(request)
        });
      } catch (e) {
        return; // classification threw → fail closed, no respondWith
      }
      if (!eligible) return; // ineligible → browser handles it normally

      // `event` is passed through ONLY after the request passed the policy
      // allowlist, so waitUntil() is reached exclusively for approved assets.
      event.respondWith(handleApprovedAsset(request, event));
    }

    // Cache-first, limited to the CURRENT static cache only. Never inspects old
    // caches, never uses a broad caches.match(). On a hit, returns it with no
    // network. On a miss, fetches and (best-effort) repairs the current cache.
    // Cache open/match failure degrades to a direct network fetch for this
    // already-approved public asset. Network failure with no hit rejects
    // naturally (no synthesized offline/HTML response).
    function handleApprovedAsset(request, event) {
      return safeOpenCurrent().then(function (cache) {
        if (!cache) return doFetch(request); // open failed → direct network
        return Promise.resolve()
          .then(function () { return cache.match(request); })
          .then(
            function (hit) {
              if (hit) return hit;
              return fetchAndRepair(request, cache, event);
            },
            function () { return doFetch(request); } // match failed → direct network
          );
      });
    }

    function safeOpenCurrent() {
      try {
        return Promise.resolve(caches.open(policy.CURRENT_STATIC_CACHE))
          .then(function (c) { return c || null; }, function () { return null; });
      } catch (e) {
        return Promise.resolve(null);
      }
    }

    function fetchAndRepair(request, cache, event) {
      return doFetch(request).then(function (response) {
        if (cache && isCacheableResponse(response)) {
          // Optional repair: extend the fetch event so the write can finish
          // after the response is returned, without the worker being killed
          // first. The repair promise is fully self-contained — it swallows both
          // synchronous clone/put throws and async put rejections — so it can
          // never reject respondWith() nor become an unhandled rejection.
          var repair = new Promise(function (resolve) {
            try {
              var copy = response.clone();
              Promise.resolve(cache.put(request, copy)).then(resolve, resolve);
            } catch (e) {
              resolve(); // sync clone()/put() throw → contained
            }
          });
          extendLifetime(event, repair);
        }
        return response; // returned immediately; never blocked on the repair
      });
      // A network rejection propagates → the eligible request rejects naturally.
    }

    // Attach a keep-alive promise to the fetch event if it exposes a usable
    // waitUntil(). If it does not (malformed / test scenario), fail safe: the
    // response is already being returned and the repair promise already contains
    // its own failures, so there is nothing to throw or block.
    function extendLifetime(event, promise) {
      try {
        if (event && typeof event.waitUntil === 'function') event.waitUntil(promise);
      } catch (e) { /* waitUntil unavailable/throwing → ignore, response unaffected */ }
    }

    // ── message ──────────────────────────────────────────────────────────────
    // Only the exact controlled-refresh hook. Everything else is ignored. Never
    // deletes caches, claims clients, reloads, or unregisters. The injected
    // skipWaiting is the SELF-BOUND wrapper from sw.js, so the native receiver is
    // preserved. The returned promise is attached to event.waitUntil() so the
    // browser keeps this worker alive until activation settles — otherwise the
    // worker can be terminated before skipWaiting() finishes and the waiting
    // worker never activates. Every failure path — a synchronous throw, a
    // rejected promise, or a non-promise return — is contained and can never
    // surface as an unhandled rejection.
    function onMessage(event) {
      diag('message_received');
      var data = event && event.data;
      if (!data || typeof data !== 'object' || data.type !== 'SKIP_WAITING') return;
      diag('command_valid');

      var port = null;
      try { var ports = event && event.ports; port = (ports && ports.length) ? ports[0] : null; } catch (e) { port = null; }

      // ONE call-and-response chain: invoke skipWaiting inside a promise (so a
      // synchronous throw becomes a rejection), wait for it to SETTLE, and only
      // then send the response — SKIP_WAITING_ACK if the browser RESOLVED the
      // skipWaiting request, SKIP_WAITING_ERROR if it threw or rejected. Neither
      // means activation completed (controllerchange is the only such signal).
      // The chain never rejects (both handlers are contained), so it is safe to
      // attach to waitUntil, which keeps the worker alive until the response is
      // delivered.
      var threwSync = false;
      var chain = Promise.resolve()
        .then(function () {
          diag('skipwaiting_call_start');
          var r;
          try {
            r = doSkipWaiting();
          } catch (e) {
            threwSync = true;
            diag('skipwaiting_sync_throw');
            throw e;                      // → rejection handler → ERROR
          }
          diag('skipwaiting_call_returned');
          return r;                        // if this rejects → rejection handler → ERROR
        })
        .then(
          function () {
            diag('skipwaiting_resolved');
            if (postResponse(port, { type: 'SKIP_WAITING_ACK' })) diag('ack_sent'); else diag('ack_send_failed');
          },
          function () {
            if (!threwSync) diag('skipwaiting_rejected');
            if (postResponse(port, { type: 'SKIP_WAITING_ERROR' })) diag('error_sent'); else diag('error_send_failed');
          }
        );

      try {
        if (event && typeof event.waitUntil === 'function') event.waitUntil(chain);
      } catch (e) { /* waitUntil unavailable/throwing → response unaffected */ }
    }

    return {
      onInstall: onInstall,
      onActivate: onActivate,
      onFetch: onFetch,
      onMessage: onMessage
    };
  }

  var SWRuntime = {
    validatePolicy: validatePolicy,
    obsoleteOwnedCaches: obsoleteOwnedCaches,
    isCacheableResponse: isCacheableResponse,
    requestHasAuthorization: requestHasAuthorization,
    createRuntime: createRuntime
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SWRuntime;
  root.SWRuntime = SWRuntime;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
