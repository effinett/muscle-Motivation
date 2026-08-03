// Muscle Motivation — PWA icon generator (Phase 4.3.1)
//
// Dependency-free, deterministic. Uses only Node built-ins (fs, zlib, path).
// Source of truth: logo.png — the near-black "M-M dumbbell" mark on a white
// background. The logo is only ever RESAMPLED (box-averaged downscale) and
// padded with its own background color; it is never stretched, cropped,
// recolored, or substituted, per CLAUDE.md §13 brand rules.
//
// Regenerate with:  node scripts/generate-pwa-icons.mjs
// Output: ./icons/*.png and ./icons/favicon.ico
//
// NOTE: this is a build-time tool only. It ships no service worker and no
// runtime code; it merely produces static image assets.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'logo.png');   // black mark on white — the app-icon artwork
const OUT = path.join(ROOT, 'icons');

// ── CRC32 (PNG chunk checksums) ───────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Minimal PNG decode (8-bit, non-interlaced, RGBA or RGB) ────────────────
function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString('ascii', pos, pos + 4); pos += 4;
    const data = buf.subarray(pos, pos + len); pos += len;
    pos += 4; // skip CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error('only 8-bit PNG supported, got ' + bitDepth);
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (!channels) throw new Error('only RGB/RGBA PNG supported, colorType=' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  // Un-filter into RGBA
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rp++];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          val = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      cur[x] = val & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels, di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

// ── PNG encode (RGBA, filter type 0) ───────────────────────────────────────
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(img) {
  const { width, height, data } = img;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const rawFiltered = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawFiltered[y * (stride + 1)] = 0; // filter: none
    data.copy(rawFiltered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(rawFiltered, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Box-average downscale (opaque source) ──────────────────────────────────
function downscale(src, T) {
  const S = src.width;
  const out = Buffer.alloc(T * T * 4);
  for (let ty = 0; ty < T; ty++) {
    const y0 = Math.floor((ty * S) / T);
    let y1 = Math.floor(((ty + 1) * S) / T); if (y1 <= y0) y1 = y0 + 1;
    for (let tx = 0; tx < T; tx++) {
      const x0 = Math.floor((tx * S) / T);
      let x1 = Math.floor(((tx + 1) * S) / T); if (x1 <= x0) x1 = x0 + 1;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * S + sx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]; n++;
        }
      }
      const di = (ty * T + tx) * 4;
      out[di] = Math.round(r / n);
      out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n);
      out[di + 3] = Math.round(a / n);
    }
  }
  return { width: T, height: T, data: out };
}

// ── Solid canvas + centered blit (for maskable padding) ────────────────────
function solid(T, [r, g, b]) {
  const data = Buffer.alloc(T * T * 4);
  for (let i = 0; i < T * T; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return { width: T, height: T, data };
}
function blitCenter(dst, inner) {
  const off = Math.round((dst.width - inner.width) / 2);
  for (let y = 0; y < inner.height; y++) {
    for (let x = 0; x < inner.width; x++) {
      const si = (y * inner.width + x) * 4;
      const di = ((y + off) * dst.width + (x + off)) * 4;
      dst.data[di] = inner.data[si];
      dst.data[di + 1] = inner.data[si + 1];
      dst.data[di + 2] = inner.data[si + 2];
      dst.data[di + 3] = inner.data[si + 3];
    }
  }
  return dst;
}

// ── ICO writer (PNG-encoded entries) ───────────────────────────────────────
function buildICO(pngs) {
  // pngs: [{ size, buf }]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + 16 * pngs.length;
  pngs.forEach((p, i) => {
    const e = i * 16;
    dir[e] = p.size >= 256 ? 0 : p.size;
    dir[e + 1] = p.size >= 256 ? 0 : p.size;
    dir[e + 2] = 0; dir[e + 3] = 0;
    dir.writeUInt16LE(1, e + 4);   // color planes
    dir.writeUInt16LE(32, e + 6);  // bpp
    dir.writeUInt32LE(p.buf.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += p.buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

// ── Main ───────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const master = decodePNG(fs.readFileSync(SRC));
if (master.width !== master.height) throw new Error('source logo must be square');

// Faithful background color sampled from the logo's own corner (its white).
const bg = [master.data[0], master.data[1], master.data[2]];
console.log(`source ${master.width}x${master.height}, corner bg rgb(${bg.join(',')})`);

// Purpose "any": faithful full-frame resample of the logo (native padding).
const ANY = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
// Purpose "maskable": logo shrunk to the safe zone, padded with its own bg.
const MASKABLE = [192, 512];
// Conservative safe-area padding: the whole logo occupies ~68% of the canvas, so
// the actual mark (already ~75% of the logo frame) lands at ~51% of the icon
// width — comfortably inside the maskable safe CIRCLE (80% diameter / 40% radius)
// and legible under circle, rounded-square, squircle, and teardrop masks.
const MASK_CONTENT = 0.68;

const written = [];
for (const T of ANY) {
  const buf = encodePNG(downscale(master, T));
  const name = `icon-${T}.png`;
  fs.writeFileSync(path.join(OUT, name), buf);
  written.push([name, T]);
}
for (const T of MASKABLE) {
  const inner = downscale(master, Math.round(T * MASK_CONTENT));
  const canvas = blitCenter(solid(T, bg), inner);
  const name = `icon-maskable-${T}.png`;
  fs.writeFileSync(path.join(OUT, name), encodePNG(canvas));
  written.push([name, T]);
}
// apple-touch-icon: iOS uses a fixed 180px opaque icon (no transparency issues
// since the logo bg is opaque white).
fs.copyFileSync(path.join(OUT, 'icon-180.png'), path.join(OUT, 'apple-touch-icon.png'));
written.push(['apple-touch-icon.png', 180]);

// favicon.ico bundling 16/32/48 — written to the web ROOT so the browser's
// implicit /favicon.ico request is satisfied on every page.
const ico = buildICO([16, 32, 48].map((size) => ({
  size,
  buf: encodePNG(downscale(master, size)),
})));
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), ico);
written.push(['../favicon.ico', '16/32/48']);

console.log('wrote:');
for (const [name, size] of written) console.log(`  icons/${name}  (${size})`);
