// INV-001 — no user-facing domain noun is written in a component. Every one comes from
// useLabels(). 03 §7.
//
// This is the MECHANICAL half. It complements, and does not replace, the manual audit in
// 22 §5: set every label to a nonsense string and walk every screen. The grep catches the
// common case cheaply; only the walkthrough catches a noun baked into an image or a
// hand-written empty state.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Pass 1 scans where components are written. `lib/` and `router/` joined at T-044: the
// 404 page and the three error boundaries are copy too, and nothing was looking at them.
const ROOTS = [
  'src/frontend/pages',
  'src/frontend/components',
  'src/frontend/lib',
  'src/frontend/router',
];

/**
 * Pass 3's roots. THE SERVER PRODUCES USER-FACING STRINGS TOO — `error.message` is
 * rendered verbatim by ten console pages — and until T-044 nothing checked them. 22 §6
 * lists three kinds (validation messages, confirmation text, export headers); the CSV
 * header was the only one ever audited, and only because it broke (`N-044`).
 *
 * `presets/` and `database/` are ABSENT on purpose and it is the same narrowing as the
 * test-file one below: they are DATA. A university preset really does say "Department",
 * and a check that fires on the hotel preset saying "Property" is a check people learn to
 * route around. `authz/` is absent for a different reason — its `because:` strings explain
 * a resolver decision to the audit trail and to 42's simulator, never to a reader; the 403
 * envelope carries `DecidedBy`, which has no room for them.
 */
const SERVER_ROOTS = [
  'src/backend/features',
  'src/backend/lib',
  'src/backend/middleware',
];

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
 * Passes 2 and 3 add the FIVE DEFAULT LABELS to that list — and only inside user-facing
 * text, because `Campaign` is also a type, a table and a route segment.
 *
 * They belong here for a reason T-044 found the hard way. `<ShareSheet>` had rendered
 * *"Respondents don't need an account."* since T-038, through four audits, on the component
 * that IS the demo. BANNED could not see it: the list holds education words, and
 * "Respondent" is the Custom preset — English, generic, and wrong for a hotel, which calls
 * them Guests. A default label is the likeliest noun to be hardcoded precisely because it
 * does not look like a domain word.
 *
 * The other presets' nouns (Ward, Guest, Patient, Team, Service) are deliberately NOT here.
 * Nobody types "Guests don't need an account" while building generic UI, and `Team` and
 * `Service` would fire on half the codebase — which is how a check stops being read.
 */
const VOCABULARY =
  /\b(Unit|Subject|Respondent|Reviewee|Campaign|Course|Faculty|Student|Semester|Department|Professor|Teacher|Pupil)s?\b/i;

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
const report = (file, line, text) => {
  failures += 1;
  console.error(`  ✗ ${file}:${line} — ${text.trim().slice(0, 100)}`);
};

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

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/**
 * `${nounsOf(req).campaign.one}` is the MECHANISM, not a hardcoding — the same allowance
 * pass 1 makes for `L.subject.many`. An interpolation is not literal text, so it is
 * replaced by a marker before the scan rather than excused afterwards: a violation written
 * around one (`That campaign ${name} is closed`) still has to fail.
 */
const literalOnly = (text) => {
  let out = text;
  let previous;
  do {
    previous = out;
    out = out.replace(/\$\{[^{}]*\}/g, '·');
  } while (out !== previous);
  return out;
};

/* ------------------------------------------------------------------ pass 1
 * Banned nouns anywhere in a component's code. Cheap, exact, and it has caught the common
 * case since T-003.
 */
let scanned = 0;
let skipped = 0;
const sources = new Map();

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (isTest(file)) {
      skipped += 1;
      continue;
    }
    scanned += 1;
    const source = stripComments(readFileSync(file, 'utf8'));
    sources.set(file, source);
    source.split('\n').forEach((line, i) => {
      if (!BANNED.test(line)) return;
      // A label KEY is allowed to be read from — it is the mechanism, not a hardcoding.
      if (/useLabels|L\.\w+\.(one|many)/.test(line)) return;
      report(file, i + 1, line);
    });
  }
}

/* ------------------------------------------------------------------ pass 2
 * The five default labels, in USER-FACING TEXT ONLY. This is the pass that would have
 * caught <ShareSheet> the day it was written.
 *
 * Two positions are read, and nothing else. JSX text between tags — the `{...}` exclusion
 * inside the class is what makes it precise, since a label read as `{L.subject.many}`
 * simply is not part of the text node. And the copy-bearing attributes, which 22 §5 names
 * as something the manual walk exists for: `aria-label`s and placeholders are invisible in
 * a screenshot and are read aloud by a screen reader.
 */
const COPY_ATTRIBUTES =
  /\b(title|placeholder|aria-label|label|description|hint|body|action|heading|alt|summary|confirmLabel|cancelLabel)\s*=\s*["']([^"']{2,200})["']/g;
/** Text that is really code: a fragment between a `=>` and a `<`, not a sentence. */
const CODEY = /[;(){}=]|=>|&&|\|\|/;

for (const [file, source] of sources) {
  for (const match of source.matchAll(/>([^<>{}]{2,400})</g)) {
    const text = literalOnly(match[1].replace(/\s+/g, ' ').trim());
    if (text.length < 2 || CODEY.test(text) || !VOCABULARY.test(text)) continue;
    report(file, lineOf(source, match.index), text);
  }
  for (const match of source.matchAll(COPY_ATTRIBUTES)) {
    if (!VOCABULARY.test(literalOnly(match[2]))) continue;
    report(file, lineOf(source, match.index), `${match[1]}="${match[2]}"`);
  }
}

/* ------------------------------------------------------------------ pass 3
 * The server's own user-facing strings (22 §6). Message-shaped literals only: something
 * with a space in it, so `kind: 'unit'` and `select: { subject: true }` — the language of
 * the schema, which is correctly English — are not findings.
 */
let server = 0;
const MESSAGE = /(['"`])([A-Z$][^'"`]{8,220})\1/g;

for (const root of SERVER_ROOTS) {
  for (const file of walk(root)) {
    if (isTest(file) || file.includes('dist-config')) continue;
    server += 1;
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const match of source.matchAll(MESSAGE)) {
      const text = literalOnly(match[2]);
      if (!/\s/.test(text) || !VOCABULARY.test(text)) continue;
      report(file, lineOf(source, match.index), text);
    }
  }
}

console.log(
  failures === 0
    ? `✓ vocabulary clean — ${scanned} component/page files scanned, ${server} server files, ${skipped} test files skipped`
    : `\n✗ ${failures} hardcoded domain noun(s). Route them through useLabels() — or, on the server, nounsOf(req) (22 §6).`,
);
process.exit(failures === 0 ? 0 : 1);
