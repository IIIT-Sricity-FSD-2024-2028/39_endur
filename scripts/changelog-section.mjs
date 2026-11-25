// Prints one version's section of CHANGELOG.md, for use as GitHub Release notes.
//
//   node scripts/changelog-section.mjs 3.1.0 > notes.md
//
// Exits 1 when the version has no section, so a release cannot go out without its changelog entry.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('usage: node scripts/changelog-section.mjs <version>');
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section. Add one before releasing.`);
  process.exit(1);
}

// The section runs until the next version heading or the link references at the bottom.
let end = lines.findIndex(
  (line, i) => i > start && (line.startsWith('## [') || /^\[[^\]]+\]: /.test(line)),
);
if (end === -1) end = lines.length;

const body = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
const compare = lines.find((line) => line.startsWith(`[${version}]: `))?.slice(version.length + 4);
process.stdout.write(body + (compare ? `\n\n**Full changes:** ${compare}\n` : '\n'));
