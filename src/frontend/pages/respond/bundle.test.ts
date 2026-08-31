// T-039 — "the respondent bundle contains no console code" (39 § Acceptance, 20 §8).
//
// That line has been in the doc since revision one with no way to check it. This walks the
// import graph out of the two respondent pages and fails if it reaches the console, the
// store, or a heavy dependency none of which belong on a phone on a venue network.
//
// A STATIC walk, not a built bundle, and the difference is worth stating: route-level
// splitting is what puts these pages in their own chunks, and this test asserts the property
// that makes the split meaningful — that nothing reachable from here is console code. If a
// respondent page ever imports <AppShell>, the build would happily emit a chunk containing
// the whole console and nothing would look wrong. Measuring the emitted chunk is T-045's
// device pass; keeping the graph clean is this file's.
//
// Type-only imports are skipped because they are erased at compile time and genuinely
// cannot reach the bundle.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '../..');

// `Book.tsx` JOINED THEM AT T-095, and adding it here is the whole of that task's frontend
// safety net: `/book/:token` is served to the same phone on the same venue network, so the
// booking page has to be held to the same rule as the form — no console code, no store, and
// nothing heavier than React and the router. A guard that walked only two of the three
// respondent pages would have said nothing about the one most recently written.
const ENTRIES = ['Fill.tsx', 'Done.tsx', 'Book.tsx'].map((file) => resolve(HERE, file));

/**
 * The app's own entry, walked separately.
 *
 * Everything statically reachable from `main.tsx` lands in the chunk EVERY route downloads,
 * respondent included — so "the respondent bundle" is really two things: these pages, and
 * the entry. The pages were always clean; the entry was not, and only this half found it.
 */
const APP_ENTRY = resolve(FRONTEND, 'main.tsx');

/** `import x from 'y'`, `export * from 'y'` — but not `import type … from 'y'`. */
const FROM = /^\s*(?:import|export)\s+(?!type\s)(?:[\s\S]*?from\s*)?['"]([^'"]+)['"]/gm;

/** TypeScript writes `./x.js` for what is on disk as `./x.ts` or `./x.tsx`. */
function onDisk(specifier: string, importer: string): string | null {
  const base = resolve(dirname(importer), specifier);
  const candidates = [
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base, `${base}.ts`, `${base}.tsx`,
  ];
  return candidates.find((path) => existsSync(path) && !path.endsWith('/')) ?? null;
}

function walk(entries: string[]): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    files.add(file);
    // Stylesheets are reachable from main.tsx and carry no JS graph.
    if (!/\.tsx?$/.test(file)) continue;

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(FROM)) {
      const specifier = match[1];
      if (!specifier) continue;
      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }
      const next = onDisk(specifier, file);
      // A relative import that resolves to nothing is a broken build, not a passing test.
      expect(next, `${relative(FRONTEND, file)} imports ${specifier}`).not.toBeNull();
      if (next) queue.push(next);
    }
  }
  return { files, packages };
}

/**
 * `path.relative()` RETURNS BACKSLASHES ON WINDOWS, and every literal in this file is
 * written with forward slashes — so without this line the whole test suite here silently
 * matched nothing on win32: `startsWith('pages/console/')` was false for every path, the
 * containment filters came back empty, and the INV-008 assertion failed outright while the
 * three above it "passed" by checking nothing. `D-040` recorded it on 30 Aug; `T-095` fixed
 * it, because that task adds `Book.tsx` to `ENTRIES` and a guard that checks nothing is
 * worse than no guard — it reports that the booking page is clean without looking.
 *
 * Normalised ONCE, here, where `reached` is built. Relaxing an assertion instead would have
 * been the wrong repair in the obvious way.
 */
const slashes = (path: string): string => path.split(sep).join('/');

const graph = walk(ENTRIES);
const reached = [...graph.files].map((file) => slashes(relative(FRONTEND, file))).sort();

// `lazy(() => import(…))` has no `from`, so the regex above sees only STATIC imports —
// which is exactly the set that cannot be split out of the entry chunk.
const entry = walk([APP_ENTRY]);

describe('the respondent world stays its own world', () => {
  it('reaches no console page and no shared chrome', () => {
    // A hotel guest scanning a QR on a table card must never see a login screen, a sidebar,
    // or a link into a product they have no account for (DEC-009).
    const console = reached.filter((path) =>
      path.startsWith('pages/console/') ||
      path.startsWith('pages/public/') ||
      path.startsWith('components/layout/') ||
      path.startsWith('components/org/'));
    expect(console).toEqual([]);
  });

  it('reaches no store', () => {
    // 39 § State: local component state only. The respond world does not mount the
    // console's providers, so a page that read from the store would crash in production
    // while passing every test that happened to wrap it in one.
    expect(reached.filter((path) => path.startsWith('store/'))).toEqual([]);
  });

  it('pulls in nothing heavy', () => {
    // lucide-react is thirty glyphs to draw two shapes; qrcode belongs to the console side
    // of the QR. Both would be downloaded before the first question renders.
    //
    // `@endur/shared` is absent, which made this test fail the first time it ran and is
    // worth stating: every use of it down this graph is `import type`, so the DTOs, the
    // label resolver and — the weight that matters — zod are erased. React and the router
    // are the whole of the respondent's runtime.
    expect([...graph.packages].sort()).toEqual(['react', 'react-router-dom']);
  });

  it('does not download the console shell before the first question', () => {
    // FOUND BY MEASURING THE BUILD, not by reading. `router/index.tsx` imports `layouts.tsx`
    // statically, `layouts.tsx` imported <AppShell> statically, and <AppShell> pulls in the
    // sidebar, the top bar and <Icon>'s thirty lucide glyphs — so all of it was in the entry
    // chunk that a phone downloads before it can render a single question.
    // Fixed by making <AppShell> lazy inside `layouts.tsx`; this is the line that holds it.
    const shell = [...entry.files]
      .map((file) => slashes(relative(FRONTEND, file)))
      .filter((path) => path.startsWith('components/layout/') || path === 'components/Icon.tsx');
    expect(shell).toEqual([]);
    expect([...entry.packages]).not.toContain('lucide-react');
    expect([...entry.packages]).not.toContain('qrcode');
  });

  it('shares the ONE <QuestionInput> set with the preview (INV-008)', () => {
    // The other half of the invariant: not merely "no console code" but "the same inputs".
    // Two implementations means the builder's preview eventually lies about what
    // respondents see, and the first anyone hears of it is on stage.
    expect(reached).toContain('components/form/QuestionInput.tsx');
  });
});
