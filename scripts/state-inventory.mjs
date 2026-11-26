// R-701 (docs/REDUX-PLAN.md §6.10): what is still outside Redux in the frontend.
//
// Lists, per file and in total:
//   - every `useState` / `useReducer` call (DEC-R03: state lives in a slice);
//   - every server call outside `store/` and the two clients (every command goes through
//     an RTK Query mutation or a thunk).
//
// Run it in every R7 change and watch the numbers go to zero:
//   node scripts/state-inventory.mjs            the table
//   node scripts/state-inventory.mjs --check    exits 1 while anything is left
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const frontend = path.join(root, 'src/frontend');
const SKIP = new Set(['node_modules', 'dist', 'dist-types']);

/** Every .ts / .tsx under src/frontend, tests excluded. */
function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const STATE = /\buse(State|Reducer)\s*(<[^>]*>+)?\s*\(/g;
// The org client's helpers and the operator client's. `lib/api.ts` and `lib/ops.ts` define
// them, and `store/` is where calling them is the point.
const CALL = /(?<![.\w])(apiGet|apiPost|apiPut|apiPatch|apiDelete|apiUpload|opsGet|opsPost|opsPut|opsPatch|opsDelete|opsRequest|opsDownload|request)\s*(<[^>]*>+)?\s*\(/g;
const CLIENTS = new Set(['lib/api.ts', 'lib/ops.ts']);

const rows = [];
for (const file of sources(frontend)) {
  const rel = path.relative(frontend, file).split(path.sep).join('/');
  // Comments out first: a file that explains `request()` in prose does not call it.
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const state = [...text.matchAll(STATE)].length;
  const calls =
    rel.startsWith('store/') || CLIENTS.has(rel) ? 0 : [...text.matchAll(CALL)].length;
  if (state || calls) rows.push({ rel, state, calls });
}

rows.sort((a, b) => b.state + b.calls - (a.state + a.calls) || a.rel.localeCompare(b.rel));
const total = rows.reduce(
  (sum, row) => ({ state: sum.state + row.state, calls: sum.calls + row.calls }),
  { state: 0, calls: 0 },
);

for (const row of rows) {
  console.log(`${String(row.state).padStart(4)} ${String(row.calls).padStart(4)}  ${row.rel}`);
}
console.log(`${'-'.repeat(11)}`);
console.log(
  `${String(total.state).padStart(4)} ${String(total.calls).padStart(4)}  ` +
    `total: useState/useReducer, server calls outside store/ — in ${rows.length} files`,
);

if (process.argv.includes('--check') && (total.state || total.calls)) process.exit(1);
