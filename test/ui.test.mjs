import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const css = fs.readFileSync(path.join(root, 'client/src/styles.css'), 'utf8');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(jsx?|css|html)$/.test(f.name)) out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(root, 'client/src')).concat(path.join(root, 'client/index.html'));

// ---------------------------------------------------------------- tokens

function block(selector) {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `missing ${selector}`);
  const start = css.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}' && --depth === 0) return css.slice(start + 1, j);
  }
  throw new Error('unterminated block');
}
const vars = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const light = vars(block(':root {'));
const darkAttr = vars(block(":root[data-theme='dark']"));
const darkMedia = vars(block(":root:not([data-theme='light'])"));
const dark = { ...light, ...darkAttr };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the automatic dark theme and the manual dark theme define exactly the same colours', () => {
  const strip = ({ '--shadow-sm': a, '--shadow-md': b, '--shadow-lg': c, ...rest }) => rest;
  assert.deepEqual(strip(darkMedia), strip(darkAttr));
  assert.ok(Object.keys(darkAttr).length >= 28, 'dark theme overrides the colour tokens');
});

test('every colour token that changes in dark mode has a light value', () => {
  for (const k of Object.keys(darkAttr)) assert.ok(k in light, `${k} missing in :root`);
});

const TEXT = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['ink', 'selected'],
  ['ink-2', 'surface'], ['ink-2', 'bg'], ['ink-2', 'surface-2'],
  ['muted', 'surface'], ['muted', 'bg'], ['muted', 'surface-2'], ['muted', 'selected'],
  ['on-primary', 'primary'], ['primary-ink', 'primary-soft'], ['primary', 'surface'],
  ['on-navy', 'navy'], ['navy-muted', 'navy'],
  ['acct-a', 'acct-a-soft'], ['acct-b', 'acct-b-soft'], ['on-acct', 'acct-a'], ['on-acct', 'acct-b'],
  ['success', 'success-soft'], ['warning', 'warning-soft'], ['danger', 'danger-soft'],
  ['success', 'surface'], ['warning', 'surface'], ['danger', 'surface'], ['acct-a', 'surface'], ['acct-b', 'surface'],
  ['ink', 'warning-soft'], ['ink', 'danger-soft'], ['ink', 'success-soft'], ['primary-ink', 'surface'],
];
const NON_TEXT = [
  ['border-strong', 'surface'], ['border-strong', 'bg'],
  ['ring', 'surface'], ['ring', 'bg'],
  ['accent', 'navy-track'], ['navy-track', 'navy'], ['accent', 'navy'],
  ['hdr-a', 'navy'], ['hdr-b', 'navy'], ['navy-line', 'navy'],
  ['acct-a', 'surface'], ['acct-b', 'surface'], ['primary', 'surface'], ['primary', 'bg'],
];

for (const [name, theme] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: text pairs meet 4.5:1`, () => {
    for (const [fg, bg] of TEXT) {
      const r = ratio(theme[`--${fg}`], theme[`--${bg}`]);
      assert.ok(r >= 4.5, `${name}: ${fg} ${theme[`--${fg}`]} on ${bg} ${theme[`--${bg}`]} is ${r.toFixed(2)}`);
    }
  });
  test(`${name} theme: non-text UI pairs meet 3:1`, () => {
    for (const [fg, bg] of NON_TEXT) {
      const r = ratio(theme[`--${fg}`], theme[`--${bg}`]);
      assert.ok(r >= 3, `${name}: ${fg} vs ${bg} is ${r.toFixed(2)}`);
    }
  });
}

test('dark header focus ring and yellow accent stay visible on the navy bar', () => {
  assert.ok(ratio(light['--accent'], light['--navy']) >= 3);
  assert.ok(ratio(dark['--accent'], dark['--navy']) >= 3);
});

// ---------------------------------------------------------------- source rules

test('no emoji or glyph icons in the client source (one SVG icon set only)', () => {
  const bad = /[✓✔✅⚠◀▶↗▾•\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => assert.ok(!bad.test(line), `${path.relative(root, f)}:${i + 1} has a glyph icon: ${line.trim()}`));
  }
});

test('no confetti, hero ring or streak leftovers', () => {
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!/confetti|Confetti|hero-ring|streak/i.test(text) || f.endsWith('schedule.js'), path.relative(root, f));
  }
  assert.ok(!fs.existsSync(path.join(root, 'client/src/components/Hero.jsx')));
});

test('Enter is not a keyboard shortcut for Mark sent: the app-level key handler never reads it', () => {
  const app = fs.readFileSync(path.join(root, 'client/src/App.jsx'), 'utf8');
  const header = fs.readFileSync(path.join(root, 'client/src/components/Header.jsx'), 'utf8');
  assert.ok(!/['"]Enter['"]/.test(app), 'App.jsx must not handle Enter');
  assert.ok(!/Enter/.test(header), 'the shortcuts popover must not mention Enter');
  assert.match(app, /ArrowDown/);
  assert.match(app, /outreach:copy/);
  assert.match(app, /e\.key === '\?'/);
  // the only Enter handlers are inside text fields (regenerate hint, demo link), which blur or regenerate, never send
  const card = fs.readFileSync(path.join(root, 'client/src/components/LeadCard.jsx'), 'utf8');
  for (const m of card.matchAll(/e\.key === 'Enter'[^\n]*/g)) assert.ok(!/send\(|actions\.send/.test(m[0]), m[0]);
});

test('self-hosted fonts and a strict CSP: no third-party font hosts anywhere', () => {
  for (const f of srcFiles) assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, 'utf8')), path.relative(root, f));
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const csp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /font-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.ok(!/unsafe-inline|googleapis|gstatic/.test(csp));
});

test('body text is 16px and focus is never removed', () => {
  assert.match(css, /body \{[^}]*font: 400 16px\/1\.5/);
  assert.ok(!/outline:\s*(none|0)\b/.test(css), 'outline must not be removed');
  assert.match(css, /:focus-visible \{[^}]*outline: 2px solid var\(--ring\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /scroll-padding-top/);
});

test('animations only touch transform and opacity', () => {
  const trans = [...css.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
  for (const t of trans) assert.ok(/^(opacity|transform)\b/.test(t.trim()), `transition on a layout/colour property: ${t}`);
});
