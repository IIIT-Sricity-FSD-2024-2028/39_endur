// Two CSS mistakes that fail SILENTLY, so nothing else in the build notices them.
//
// 1. A `var(--x)` with no `--x` defined anywhere. The declaration is dropped at computed-value
//    time: the border is not drawn, the margin is zero. Five tokens were missing at once
//    (--space-5, --space-10, --color-border, --color-ink, --text-sm) and six borders had never
//    been on screen.
// 2. An offset (`top`, `left`, `inset`, …) on a selector that is never given a `position`. The
//    offset does nothing. Every `position: sticky` in endur.css was lost in one pass, leaving
//    the `top: 0` behind: the powers grid's headers, the top bar and the respondent progress
//    bar all stopped sticking, and every one of them still LOOKED sticky in the source.
//
// Custom properties set from TSX (`style={{ '--weight': … }}`) count as defined. A `var()` with
// a fallback is not a finding: the fallback is the point.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CSS_ROOT = 'src/frontend/design-system';
const TSX_ROOTS = ['src/frontend/pages', 'src/frontend/components', 'src/frontend/lib'];

function* walk(dir, test) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path, test);
    else if (test(path)) yield path;
  }
}

/** Comments become blanks of the same shape, so line numbers survive. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const cssFiles = [...walk(CSS_ROOT, (path) => path.endsWith('.css'))];
const sources = new Map(cssFiles.map((file) => [file, stripComments(readFileSync(file, 'utf8'))]));

// ── Defined custom properties: in any stylesheet, or set from a component.
const defined = new Set();
for (const source of sources.values()) {
  for (const match of source.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(match[1]);
}
for (const root of TSX_ROOTS) {
  for (const file of walk(root, (path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/['"](--[a-zA-Z0-9-]+)['"]/g)) {
      defined.add(match[1]);
    }
  }
}

let failures = 0;
const report = (file, line, text) => {
  failures += 1;
  console.error(`  ✗ ${file}:${line} — ${text}`);
};

// ── 1. Undefined tokens.
for (const [file, source] of sources) {
  for (const match of source.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g)) {
    if (match[2] === ',') continue; // has a fallback
    if (!defined.has(match[1])) report(file, lineOf(source, match.index), `${match[1]} is never defined`);
  }
}

// ── 2. Offsets on selectors that are never positioned.
// Innermost blocks only (`selector { declarations }`), so @media wrappers are walked through.
const OFFSET = /(?:^|[;{\s])(top|right|bottom|left|inset(?:-[a-z]+)?)\s*:/;
// `static` is the one value under which an offset does nothing, so it does not count.
const POSITIONED = /(?:^|[;\s])position\s*:\s*(?!static\b)[a-z]/;
/** `.skip-link:focus-visible` is the same element as `.skip-link`. */
const base = (selector) => selector.replace(/::?[a-z-]+(\([^)]*\))?/g, '');
/**
 * Selectors that only ever appear ON an element another class positions. Each says which, so
 * the exception is a reason rather than a hole.
 */
const ALONGSIDE = {
  '.menu-right': '.menu (position: absolute)',
  '.ambient-field-1': '.ambient-field (position: absolute)',
  '.ambient-field-2': '.ambient-field (position: absolute)',
  '.ambient-field-3': '.ambient-field (position: absolute)',
  '.ambient-field-4': '.ambient-field (position: absolute)',
  '.ambient-field-5': '.ambient-field (position: absolute)',
};
const positioned = new Set(Object.keys(ALONGSIDE));
const offsets = [];
for (const [file, source] of sources) {
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].trim().split(',').map((part) => part.trim().replace(/\s+/g, ' '));
    if (selectors.some((selector) => selector.startsWith('@') || /^(from|to|\d+%)$/.test(selector))) continue;
    const body = match[2];
    if (POSITIONED.test(body)) selectors.forEach((selector) => positioned.add(base(selector)));
    const offset = OFFSET.exec(body);
    if (offset) offsets.push({ file, index: match.index + match[1].length, selectors, property: offset[1] });
  }
}
for (const { file, index, selectors, property } of offsets) {
  const unpositioned = selectors.filter((selector) => !positioned.has(base(selector)));
  if (unpositioned.length > 0) {
    report(file, lineOf(sources.get(file), index), `\`${property}\` on ${unpositioned.join(', ')}, which is never given a position`);
  }
}

console.log(
  failures === 0
    ? `✓ css clean — ${cssFiles.length} stylesheets, ${defined.size} custom properties defined`
    : `\n✗ ${failures} silent CSS mistake(s): define the token, or give the selector a position.`,
);
process.exit(failures === 0 ? 0 : 1);
