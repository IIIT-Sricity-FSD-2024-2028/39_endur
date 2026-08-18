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
    readFileSync(file, 'utf8')
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
