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

/**
 * Test files are NOT scanned, and that is a narrowing with a reason rather than a hole.
 *
 * INV-001 is about what a component RENDERS. A `.test.tsx` renders nothing to anybody: its
 * strings are fixtures standing in for customer data, and customer data is legitimately
 * English — a university really does have a template called "Course feedback", the same
 * way `src/backend/presets/**` really does say "Department". Scanning them produced 18
 * findings at T-035 that were all the check's fault.
 *
 * Nothing is lost. A noun hardcoded in a component is caught in the COMPONENT, which is
 * still scanned; a test could only ever have echoed it. This is the fourth time this repo
 * has narrowed a check that fired on something it was not about (N-023), and the rule each
 * time is the same: a check that cries wolf gets routed around, and then it stops catching
 * the real thing. Proved at T-035 by adding a real hardcoded noun to a component and
 * watching this still fail.
 */
const isTest = (path) => /\.test\.tsx?$/.test(path);

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
let skipped = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (isTest(file)) {
      skipped += 1;
      continue;
    }
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
    ? `✓ vocabulary clean — ${scanned} component/page files scanned, ${skipped} test files skipped`
    : `\n✗ ${failures} hardcoded domain noun(s). Route them through useLabels().`,
);
process.exit(failures === 0 ? 0 : 1);
