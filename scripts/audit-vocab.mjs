// INV-001 — no user-facing domain noun is written in a component. Every one comes from
// useLabels(). 03 §7.
//
// This is the MECHANICAL half. It complements, and does not replace, the manual audit in
// 22 §5: set every label to a nonsense string and walk every screen. The grep catches the
// common case cheaply; only the walkthrough catches a noun baked into an image or a
// hand-written empty state.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/frontend/pages', 'src/frontend/components'];

// Words that describe THE CUSTOMER'S WORLD. If a word describes Endur itself
// (Save, Cancel, Settings, Question, Response) it is correctly literal — 22 §1.
const BANNED = /\b(Course|Faculty|Student|Semester|Department|Professor|Teacher|Pupil)s?\b/;

/**
 * Comments are stripped before the scan, and that is not a loophole.
 *
 * INV-001 is about what RENDERS. A comment renders nothing, and the comments most likely
 * to name these words are the ones EXPLAINING the invariant — "the button label uses the
 * vocabulary: Add a Department here, Add a Property in the hotel org". A check that fails
 * on its own explanation is a check people learn to route around, and then it stops
 * catching the real thing (the same lesson audit-drift learned at T-003, and the reason
 * seed.test.ts's INV-002 scan has stripped comments since T-025).
 *
 * Line numbers are preserved so a genuine hit still points at the right line: block
 * comments become the same number of blank lines rather than disappearing.
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');

let failures = 0;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // not built yet — an absent page directory is not a failure
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(path)) yield path;
  }
}

let scanned = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    scanned += 1;
    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, i) => {
        if (!BANNED.test(line)) return;
        // A label KEY is allowed to be read from — it is the mechanism, not a hardcoding.
        if (/useLabels|L\.\w+\.(one|many)/.test(line)) return;
        failures += 1;
        console.error(`  ✗ ${file}:${i + 1} — ${line.trim().slice(0, 90)}`);
      });
  }
}

console.log(
  failures === 0
    ? `✓ vocabulary clean — ${scanned} component/page files scanned`
    : `\n✗ ${failures} hardcoded domain noun(s). Route them through useLabels().`,
);
process.exit(failures === 0 ? 0 : 1);
