// Where the tests are allowed to write.
// The suite used to run against the DEVELOPMENT database, which cost real time twice: thousands of junk
// organisations pushed the demo seed out, and the advertised demo logins stopped working.
// Two structural guard rails: the database name must end in _test, and it must not be the DATABASE_URL
// written in .env. Rule 2 reads the FILE rather than the environment, because once the suite has pointed
// the process at the test database, comparing against the environment would refuse to run for the exact
// reason everything was correct.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo-root .env, found by walking up rather than counting directories, so renaming a folder cannot break it.
function findRepoEnv(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 6; up += 1) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function loadRepoEnv(): string | null {
  const file = findRepoEnv();
  // It never overwrites a variable that is already set, so TEST_DATABASE_URL and CI still win over the file.
  if (file) process.loadEnvFile(file);
  return file;
}

// DATABASE_URL as WRITTEN IN THE FILE: the developer's own database, whatever the process was later pointed at.
// Absent in CI, where there is no file and no local database to protect.
function devUrlFromFile(file: string | null): string | null {
  if (!file) return null;
  const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(readFileSync(file, 'utf8'));
  return match?.[1]?.replace(/^["']|["']$/g, '') ?? null;
}

/** `postgresql://…/endur` → `postgresql://…/endur_test`. Used when TEST_DATABASE_URL is
 *  absent, so the common case needs no configuration and still cannot land on `endur`. */
// Turns the developer's database URL into the matching _test one.
function derive(devUrl: string): string {
  const url = new URL(devUrl);
  const name = url.pathname.replace(/^\//, '');
  if (!name) throw new Error('DATABASE_URL has no database name, so no test name can be derived from it.');
  // Idempotent. Without this, a second call inside an already-switched process derives
  // `endur_test_test` — a database nobody created, so the run fails at connect with a
  // message about a missing database rather than about the double derivation.
  if (name.endsWith('_test')) return url.toString();
  url.pathname = `/${name}_test`;
  return url.toString();
}

// The database name out of a connection URL.
export function nameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/**
 * The rules, with no environment in sight so they can be tested directly.
 *
 * `configured` is TEST_DATABASE_URL if one is set; `devUrl` is where the process is
 * currently pointed; `writtenDevUrl` is the DATABASE_URL in `.env`, or null when there is no
 * file — which means CI, which has no development database to protect.
 */
// Works out which database the tests may use, and refuses anything that is not clearly a test one.
export function resolveTestUrl(
  devUrl: string,
  configured?: string  ,
  writtenDevUrl?: string | null,
): string {
  const url = configured ?? derive(devUrl);
  const name = nameOf(url);

  // Rule 1 — the name. A typo that lands on `endur`, or on anything not obviously a scratch
  // database, fails HERE rather than in the first test that writes a row.
  if (!name.endsWith('_test')) {
    throw new Error(
      `The test database is "${name}", which does not end in "_test". Refusing to run: this suite `
      + 'creates and truncates, and a name it cannot recognise is not one it should be writing to.',
    );
  }

  // Rule 2 — not the developer's own database. Compared against what is WRITTEN IN THE FILE,
  // Compared against the FILE's value, which does not move: by the second call the process has legitimately
  // been pointed at the test database.
  if (writtenDevUrl && url === writtenDevUrl) {
    throw new Error(
      'TEST_DATABASE_URL is the same as the DATABASE_URL in .env. The suite truncates and rewrites '
      + 'what it points at, so this would destroy the development database — and the demo seed with '
      + 'it. Point TEST_DATABASE_URL somewhere else (see .env.example).',
    );
  }

  return url;
}

// A cap on the connection pool. Each worker builds its own client with a default pool of about 33,
// so fifteen workers would ask a 100-connection Postgres for nearly 500.
// It is NOT what fixed the intermittent timeouts - that was the test timeout having no headroom - but
// 5 per worker still fits comfortably under the limit.
function withPoolCap(url: string): string {
  const parsed = new URL(url);
  // A default, not an override: an explicit TEST_DATABASE_URL that already tunes the pool is the author saying something.
  if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '5');
  return parsed.toString();
}

// The connection URL the whole suite runs against.
export function testDatabaseUrl(): string {
  const file = loadRepoEnv();

  const current = process.env.DATABASE_URL;
  if (!current) throw new Error('DATABASE_URL is not set, so there is nothing to derive a test database from.');

  // The cap goes on AFTER the guards, never before: rule 2 compares URLs, and extra query parameters
  // would make them unequal - a guard that stops firing because of a performance tweak.
  return withPoolCap(resolveTestUrl(current, process.env.TEST_DATABASE_URL, devUrlFromFile(file)));
}
