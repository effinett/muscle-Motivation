'use strict';

// Phase 4.3.1 — PWA installability foundation.
// Static validation of the web app manifest, icon assets, per-page platform
// metadata, and the guarantee that NO service worker / caching was introduced.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// Read width/height from a PNG IHDR (bytes 16..24). Returns {w,h}.
function pngSize(relPath) {
  const buf = fs.readFileSync(path.join(ROOT, relPath));
  assert.deepStrictEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${relPath} is a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Minimal PNG → RGBA decoder (8-bit, non-interlaced) for opacity checks.
function decodeRGBA(relPath) {
  const buf = fs.readFileSync(path.join(ROOT, relPath));
  let pos = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len + 4;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rb = raw[rp++];
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v;
      if (f === 0) v = rb; else if (f === 1) v = rb + a; else if (f === 2) v = rb + b;
      else if (f === 3) v = rb + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = rb + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const si = x * ch, di = (y * width + x) * 4;
      out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2];
      out[di + 3] = ch === 4 ? cur[si + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

const manifest = JSON.parse(read('manifest.webmanifest'));

// HTML pages that must carry PWA metadata: every root page EXCEPT calculator.html
// (which is protected by CLAUDE.md §3 and must never be modified).
const htmlPages = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && f !== 'calculator.html');

test('manifest: valid JSON with required installability fields', () => {
  assert.strictEqual(manifest.name, 'Muscle Motivation');
  assert.strictEqual(manifest.short_name, 'Muscle Motivation', 'full brand identity preserved');
  assert.strictEqual(manifest.id, '/', 'stable app identity');
  assert.strictEqual(manifest.start_url, '/app.html', 'start_url is the authenticated app entry');
  assert.strictEqual(manifest.scope, '/', 'scope covers the whole origin');
  assert.strictEqual(manifest.display, 'standalone');
  assert.ok(!('orientation' in manifest), 'no orientation lock (usable rotated / tablet / desktop)');
  assert.strictEqual(manifest.theme_color, '#121011', 'canonical dark brand color');
  assert.strictEqual(manifest.background_color, '#121011', 'canonical dark brand color');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test('manifest: start_url and scope are consistent (no redirect-loop shape)', () => {
  // start_url must live within scope so the installed app opens in-scope.
  assert.ok(manifest.start_url.startsWith(manifest.scope));
});

test('manifest: has 192 & 512 "any" icons plus a maskable icon', () => {
  const anySizes = manifest.icons
    .filter((i) => !i.purpose || i.purpose.split(' ').includes('any'))
    .map((i) => i.sizes);
  assert.ok(anySizes.includes('192x192'), 'has 192 any icon');
  assert.ok(anySizes.includes('512x512'), 'has 512 any icon');

  const maskable = manifest.icons.filter((i) => i.purpose && i.purpose.split(' ').includes('maskable'));
  assert.ok(maskable.length >= 1, 'at least one maskable icon');
  assert.ok(maskable.some((i) => i.sizes === '512x512'), 'a 512 maskable icon');
});

test('manifest: every icon file exists, is a PNG, and matches its declared size', () => {
  for (const icon of manifest.icons) {
    const rel = icon.src.replace(/^\//, '');
    assert.ok(exists(rel), `${icon.src} exists`);
    assert.strictEqual(icon.type, 'image/png');
    const [w, h] = icon.sizes.split('x').map(Number);
    const dim = pngSize(rel);
    assert.strictEqual(dim.w, w, `${icon.src} width`);
    assert.strictEqual(dim.h, h, `${icon.src} height`);
  }
});

test('maskable icons are fully opaque (no transparency in the safe area)', () => {
  for (const size of [192, 512]) {
    const img = decodeRGBA(`icons/icon-maskable-${size}.png`);
    let minA = 255;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < minA) minA = img.data[i];
    assert.strictEqual(minA, 255, `icon-maskable-${size}.png is fully opaque`);
  }
});

test('maskable icons carry conservative safe-area padding (white margin ring)', () => {
  // The mark must not reach the icon edge: sample the outer 8% border and assert
  // it is the opaque white background — proving deliberate maskable padding.
  for (const size of [192, 512]) {
    const img = decodeRGBA(`icons/icon-maskable-${size}.png`);
    const m = Math.round(size * 0.08);
    const px = (x, y) => { const i = (y * size + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
    for (let x = 0; x < size; x += 1) {
      for (const y of [m, size - 1 - m]) assert.deepStrictEqual(px(x, y), [255, 255, 255], `${size} top/bottom margin white @${x}`);
    }
    for (let y = 0; y < size; y += 1) {
      for (const x of [m, size - 1 - m]) assert.deepStrictEqual(px(x, y), [255, 255, 255], `${size} left/right margin white @${y}`);
    }
  }
});

test('generation rule encodes deliberate maskable safe-area padding (reproducible)', () => {
  const gen = read('scripts/generate-pwa-icons.mjs');
  const m = gen.match(/MASK_CONTENT\s*=\s*([0-9.]+)/);
  assert.ok(m, 'MASK_CONTENT padding constant is defined');
  const frac = parseFloat(m[1]);
  assert.ok(frac >= 0.6 && frac <= 0.72, `MASK_CONTENT (${frac}) is a conservative 60-72% safe scale`);
});

test('icons: apple-touch-icon and favicon assets exist', () => {
  assert.ok(exists('icons/apple-touch-icon.png'), 'apple-touch-icon present');
  const at = pngSize('icons/apple-touch-icon.png');
  assert.strictEqual(at.w, 180);
  assert.strictEqual(at.h, 180);
  assert.ok(exists('favicon.ico'), 'root favicon.ico present (implicit browser request)');
  assert.ok(exists('icons/icon-16.png') && exists('icons/icon-32.png'), 'PNG favicons present');
});

test('every app HTML page (except calculator.html) links the manifest + platform metadata', () => {
  for (const page of htmlPages) {
    const html = read(page);
    assert.match(html, /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/, `${page} links manifest`);
    assert.match(html, /<meta[^>]+name="theme-color"[^>]+content="#121011"/, `${page} theme-color`);
    assert.match(html, /name="apple-mobile-web-app-capable"[^>]+content="yes"/, `${page} apple capable`);
    assert.match(html, /name="apple-mobile-web-app-title"[^>]+content="Muscle Motivation"/, `${page} apple title`);
    assert.match(html, /rel="apple-touch-icon"[^>]+href="\/icons\/apple-touch-icon\.png"/, `${page} apple-touch-icon`);
    assert.match(html, /name="viewport"[^>]+viewport-fit=cover/, `${page} viewport-fit=cover (safe-area)`);
  }
});

test('calculator.html is untouched — no PWA metadata injected (CLAUDE.md §3)', () => {
  const html = read('calculator.html');
  assert.ok(!html.includes('rel="manifest"'), 'calculator.html has no manifest link');
});

test('vercel.json serves the manifest with the correct content type', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const rule = vercel.headers.find((h) => h.source === '/manifest.webmanifest');
  assert.ok(rule, 'a headers rule targets /manifest.webmanifest');
  const ct = rule.headers.find((h) => h.key === 'Content-Type');
  assert.ok(ct && /application\/manifest\+json/.test(ct.value), 'Content-Type is application/manifest+json');
});

// Phase 4.3.2 amendment. A TESTED, UNREGISTERED service-worker file may now
// exist (Checkpoint 2), but the Phase 4.3.1 guarantees are preserved: no page
// registers a worker, no registration module exists, and Cache Storage usage is
// confined to the dedicated worker runtime files — nowhere else. The rule
// changed from "no service worker exists" to "a worker file may exist, but no
// runtime registration or unsafe caching is allowed yet."
test('a service worker may exist but stays unregistered with no unsafe caching', () => {
  // Cache Storage is permitted ONLY inside these dedicated worker runtime files.
  const WORKER_FILES = new Set(['sw.js', 'sw-runtime.js']);

  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'reports') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!/\.(html|js|mjs)$/.test(entry.name)) continue;
      // Test files legitimately reference these terms as assertions.
      if (/\.test\.js$/.test(entry.name)) continue;
      const txt = fs.readFileSync(full, 'utf8');
      // No runtime registration anywhere — Checkpoint 3 introduces it.
      assert.ok(!/serviceWorker\s*\.\s*register/.test(txt), `${entry.name}: no serviceWorker.register`);
      assert.ok(!/navigator\s*\.\s*serviceWorker/.test(txt), `${entry.name}: no navigator.serviceWorker`);
      // Cache Storage usage is confined to the worker runtime files.
      if (!WORKER_FILES.has(entry.name)) {
        assert.ok(!/\bcaches\s*\.\s*(open|match|keys|delete)\b/.test(txt),
          `${entry.name}: no Cache Storage usage outside the worker`);
      }
    }
  };
  scan(ROOT);

  // The tested worker files exist; no registration shim; no legacy sw filename.
  assert.ok(exists('sw.js'), 'sw.js exists');
  assert.ok(exists('sw-policy.js'), 'sw-policy.js exists');
  assert.ok(exists('sw-runtime.js'), 'sw-runtime.js exists');
  assert.ok(!exists('sw-register.js'), 'no registration module yet (Checkpoint 3)');
  assert.ok(!exists('service-worker.js'), 'no alternate service-worker file');

  // No HTML page loads or registers the worker (worker stays inert).
  for (const page of htmlPages) {
    const html = read(page);
    assert.ok(!/serviceWorker/.test(html), `${page}: no service worker reference`);
    assert.ok(!/\bsw\.js\b/.test(html), `${page}: does not load sw.js`);
  }

  // The approved static allowlist still contains no API or HTML path.
  const policy = require('./sw-policy.js');
  for (const p of policy.STATIC_ALLOWLIST) {
    assert.ok(!p.includes('/api/') && !/\.html$/.test(p), `allowlist entry ${p} is not API/HTML`);
  }
});
