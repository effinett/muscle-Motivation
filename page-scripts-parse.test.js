'use strict';
// Every inline classic <script> on every page must parse. Page tests extract
// single functions, so a stray brace elsewhere in a page script can pass them
// and still stop the whole page from loading (workout.html, 2026-11-10).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const SCRIPT_RE = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
const NON_JS_TYPE = /\btype\s*=\s*["']?(?!(?:text|application)\/javascript\b)[^"'\s>]+/i;

function inlineScripts(html) {
  const out = [];
  let m;
  while ((m = SCRIPT_RE.exec(html))) {
    if (NON_JS_TYPE.test(m[1])) continue; // JSON, ld+json, modules, templates
    const line = html.slice(0, m.index).split('\n').length;
    out.push({ line, code: m[2] });
  }
  return out;
}

test('there are pages to check', () => {
  assert.ok(PAGES.includes('workout.html'));
});

for (const page of PAGES) {
  test(`${page}: every inline script parses`, () => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    for (const { line, code } of inlineScripts(html)) {
      try {
        new vm.Script(code, { filename: `${page}:${line}` });
      } catch (e) {
        assert.fail(`${page} script starting at line ${line}: ${e.message}`);
      }
    }
  });
}
