# PWA Foundation — Phase 4.3.1 (Installability Only)

**Status:** `Live`. This checkpoint makes Muscle Motivation installable as a
Progressive Web App. It is **installability + platform metadata only**. It
deliberately ships **no service worker, no Cache Storage, no offline behavior,
no background sync, no push, and no install-prompt UI.** Those are later
checkpoints (4.3.2+) and MUST build on this file.

## What shipped

| Artifact | Purpose |
|---|---|
| `manifest.webmanifest` | Web app manifest (name, icons, colors, display, routing). |
| `icons/` | Generated PNG icons — `icon-{16,32,48,72,96,128,144,152,180,192,256,384,512}.png`, `icon-maskable-{192,512}.png`, `apple-touch-icon.png` (180). |
| `favicon.ico` (repo root) | 16/32/48 bundle; satisfies the browser's implicit `/favicon.ico` request on every page. |
| `scripts/generate-pwa-icons.mjs` | Dependency-free (Node built-ins only) icon generator. Re-run with `node scripts/generate-pwa-icons.mjs`. |
| Head metadata | Injected into every root HTML page **except `calculator.html`** (protected by CLAUDE.md §3): `manifest` link, `theme-color`, Apple mobile-web-app meta, app title, favicon + apple-touch-icon links. |
| `vercel.json` | Adds `Content-Type: application/manifest+json` for `/manifest.webmanifest`. |
| `pwa-manifest.test.js` | Static validation (schema, icon existence + real PNG dimensions, per-page metadata, no-service-worker guard, content-type). |

## Key decisions & rationale

- **`start_url = /app.html`, `scope = /`.** `app.html` is the authenticated
  application entry. Its guard redirects signed-out users to `auth.html` and
  not-yet-onboarded users to `onboarding.html`; those pages redirect back to
  `app.html` once authenticated/onboarded. The chain terminates for every state
  — **no redirect loop** — and all pages are in `scope: /`, so the installed
  app stays in standalone across the whole origin.
- **`display: standalone`; no `orientation` lock.** Mobile-first but not
  portrait-only — the `orientation` property is deliberately omitted so the
  installed app stays usable on rotated phones, tablets, foldables, desktop
  windows, and accessibility-oriented device configurations.
- **`theme_color` / `background_color` = `#121011`** (canonical dark brand
  near-black). Used for the OS toolbar tint and the splash background so the
  install/launch transition reads as the dark Muscle Motivation surface.
- **`short_name` = "Muscle Motivation".** Full brand identity preserved;
  launcher truncation is preferable to reducing it to a generic word.
- **Icon artwork = white background, black logo** (`logo.png` as source). A
  light icon over the dark app is an intentional, standard pairing. The logo is
  only ever box-average **resampled** and padded with its own white background —
  never stretched, cropped, recolored, or substituted (CLAUDE.md §13).
- **Maskable safe zone.** Maskable icons shrink the whole logo to ~68% of the
  canvas (`MASK_CONTENT` in `scripts/generate-pwa-icons.mjs`) and pad with white,
  placing the mark at ~51% icon width — comfortably inside the maskable safe
  circle and legible under circle, rounded-square, squircle, and teardrop masks.
  The assets are fully opaque; automated tests assert opacity, the white margin
  ring, and the padding constant.
- **Apple status bar = `black`** (not `black-translucent`): a solid black bar
  matches the dark app and avoids content sliding under the status bar on the
  varied hero-header pages. `viewport-fit=cover` + `safe-area.css` already handle
  insets globally.
- **`calculator.html` excluded.** Hard rule (CLAUDE.md §3). Its browser tab icon
  still resolves via the implicit root `/favicon.ico`; only in-page install
  offering is absent there.

## Hard constraints for future service-worker work (4.3.2+)

The single biggest risk when a service worker is added later is **serving stale
authenticated or API content**. Any future caching MUST:

1. **Never cache HTML navigations** for authenticated pages (`app.html`,
   `nutrition.html`, `workout*.html`, `onboarding.html`, etc.) in a way that can
   show one user's data to another or survive sign-out. Prefer network-first (or
   no caching) for documents.
2. **Never cache `/api/*` responses** — USDA, Stripe, ai-food-parse, Supabase
   traffic must always hit the network. Auth tokens and per-user data must not be
   persisted by a cache.
3. **Never cache Supabase auth or session state.**
4. Scope any precache to **immutable static assets** (icons, fonts, versioned
   CSS/JS) with explicit cache-busting and a cleanup/upgrade path.
5. Keep the manifest identity stable: do not change `id`, `start_url`, or `scope`
   without a migration plan (changing them can fork the installed app identity).

Until a service worker is intentionally designed against these constraints, the
app remains a standard online-only installable web app — exactly the safe state
this checkpoint establishes.

## Phase 4.3.2 — Service-worker foundation (in progress, NOT registered)

Phase 4.3.2 builds the service-worker foundation in small checkpoints. **No
production/runtime behavior has changed: no page registers or loads the worker,
so it is inert.** The app is still the online-only installable PWA described
above.

| Checkpoint | Status | Artifact | Purpose |
|---|---|---|---|
| 1 | `Live` (committed) | `sw-policy.js`, `sw-policy.test.js` | Pure cache-policy core: the frozen static allowlist, `mm-static-vN` cache naming/ownership, and default-deny request eligibility (same-origin GET, no `Authorization`, exact allowlisted path). Single source of truth. |
| 2 | present, **unregistered** | `sw.js`, `sw-runtime.js`, `sw.test.js` | The worker runtime + a thin entrypoint. Exists and is fully tested but is **not registered by any page**. |
| 3 | not started | (`sw-register.js`, UI) | Registration, update detection, and the user-controlled refresh flow. |

**Checkpoint 2 behavior (worker file only, still unregistered):**

- `sw.js` is a thin entrypoint: `importScripts('/sw-policy.js')` +
  `importScripts('/sw-runtime.js')`, then injects the real worker globals
  (`self.caches`, `fetch`, `self.skipWaiting`, `self.location.origin`) into the
  deterministic runtime and attaches the lifecycle listeners. It hard-codes no
  allowlist, cache name, or classification — `sw-policy.js` remains authoritative.
  If the policy/runtime fails to load or the policy contract is incomplete, it
  attaches **no** listeners (fails safe → normal browser networking).
- **install** precaches **only** the approved static icon/favicon allowlist into
  `SWPolicy.CURRENT_STATIC_CACHE`, all-or-nothing (a partial cache never
  activates). It does **not** call `skipWaiting()` and deletes nothing.
- **activate** deletes only obsolete owned `mm-static-*` caches, never the
  current one and never any unrelated cache. It does **not** call
  `clients.claim()`, does not reload, and never touches Local Storage,
  IndexedDB, cookies, or any non–Cache-Storage state.
- **fetch** is default pass-through: it intercepts **only** requests the policy
  approves (same-origin GET for an allowlisted static asset, no `Authorization`
  header), serving them cache-first from the current cache only. On a miss, the
  network response is **returned immediately**; the optional cache repair is
  protected with the fetch event's `waitUntil()` (so the write can complete
  without the worker being killed first) and **repair failure never blocks or
  rejects the response**. **HTML navigation stays network-only** (never
  intercepted), and **API, Supabase, cross-origin, authorization-bearing,
  non-GET, and unknown requests are never cached and never intercepted.**
  Classification errors fail closed.
- **message** supports only `{ type: 'SKIP_WAITING' }` (the future
  controlled-refresh hook) → the injected `skipWaiting`; everything else is
  ignored. This is the sole `skipWaiting()` path — never automatic, never at
  install.

The worker is documented here as **inert and unregistered**; it is **not
shipped, active, installed, or production-validated**. Automatic activation and
`clients.claim()` remain prohibited. Registration and the controlled update UI
are Checkpoint 3. **Android validation remains deferred** (from Phase 4.3.1) and
does not block this work.
