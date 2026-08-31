// Two cheap checks that stop the docs and the code from silently disagreeing.
// 03 §7. Runs in CI. Exits non-zero on any finding.
//
// Note on check 1: the banned-token patterns are BUILT from parts rather than written
// literally, because a literal pattern in this file would be found by a naive grep of the
// repo and report itself. That self-match wasted an afternoon once (DRIFT-003).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ARCH = 'architecture';
const CAPS_FILE = 'packages/shared/src/capabilities.ts';

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`  ✗ ${msg}`);
};

const docs = readdirSync(ARCH)
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ name: f, text: readFileSync(join(ARCH, f), 'utf8') }));

// ---------------------------------------------------------------------------
// 1. No design VALUE appears in architecture/. Design values live in design_specs
//    and are authoritative there; a copy here is a second source of truth (DEC-012).
// ---------------------------------------------------------------------------
console.log('check 1 — no design values in architecture/');

const HEX = new RegExp('#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b');
const FONTS = new RegExp(['Capr', 'asimo'].join('') + '|' + ['Fig', 'tree'].join(''));
// Deliberately NOT flagging every px value. Docs legitimately state behavioural
// constraints that happen to carry a unit — a 44px tap target, a 390px breakpoint, the
// 16px input font that stops iOS zooming on focus. Those are requirements, not styling.
// What is banned is the design system's own token names leaking in (DEC-012).
const TOKEN = new RegExp('--(?:color|space|radius|font|shadow|size)-[a-z0-9-]+');

for (const { name, text } of docs) {
  text.split('\n').forEach((line, i) => {
    // A path reference like design_specs/design/01 §2 is a POINTER, not a value.
    if (line.includes('design_specs')) return;
    for (const [label, re] of [
      ['hex colour', HEX],
      ['font name', FONTS],
      ['design token', TOKEN],
    ]) {
      if (re.test(line)) fail(`${name}:${i + 1} ${label} — ${line.trim().slice(0, 90)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Every capability named in a doc exists in the catalogue. This is the useful one:
//    it means a page doc cannot invent a verb that no code will ever grant.
// ---------------------------------------------------------------------------
console.log('check 2 — every documented capability exists in the catalogue');

const capsSrc = readFileSync(CAPS_FILE, 'utf8');
const known = new Set([...capsSrc.matchAll(/^\s*'([a-z]+\.[a-z]+)':\s*\{/gm)].map((m) => m[1]));
if (known.size === 0) throw new Error(`parsed 0 capabilities from ${CAPS_FILE}`);

const modules = new Set([...known].map((c) => c.split('.')[0]));

for (const { name, text } of docs) {
  // Only look inside the sections that make a capability CLAIM. Prose elsewhere may
  // legitimately mention a dotted token (req.body, package.json) that is not a capability.
  const sections = [...text.matchAll(/^##+ .*Capabilit(?:y|ies).*$/gim)].map((m) => {
    const start = m.index;
    const rest = text.slice(start + m[0].length);
    const end = rest.search(/^##+ /m);
    return rest.slice(0, end === -1 ? undefined : end);
  });
  // 50 §1's grant matrix is the other place capabilities are asserted.
  if (name.startsWith('50-')) sections.push(text);

  for (const section of sections) {
    for (const [, token] of section.matchAll(/`([a-z]+\.(?:[a-z]+|\*))`/g)) {
      const [mod, verb] = token.split('.');
      if (verb === '*') {
        if (!modules.has(mod)) fail(`${name}: \`${token}\` — no such capability module`);
        continue;
      }
      // Only tokens whose MODULE is real are treated as capability claims. Prose in
      // these sections legitimately contains other dotted names (req.data, meta.total,
      // customization.md), and a check that cries wolf gets ignored, which is worse
      // than no check. The realistic mistake — right module, invented verb — is caught.
      if (!modules.has(mod)) continue;
      if (!known.has(token)) fail(`${name}: \`${token}\` is not in the catalogue`);
    }
  }
}

console.log(
  failures === 0
    ? `\n✓ drift clean — ${docs.length} docs, ${known.size} capabilities`
    : `\n✗ ${failures} finding(s)`,
);
process.exit(failures === 0 ? 0 : 1);
