// D-004 — where the tests are allowed to write.
//
// Every integration test registers organisations, users and responses, and until 21 Aug it
// did that in the DEVELOPMENT database. That is not a tidiness problem. It cost real time
// twice: 2,726 junk organisations pushed the demo seed out of `endur` and the advertised
// logins stopped working, and `uniqueSlug()` gave up after twenty variants, so the
// twenty-first run of the suite failed with a slug conflict inside a test about unknown keys.
//
// A rehearsal against a polluted database is not evidence about the demo, which is why this
// is due before T-045.
//
// The guard rails matter more than the resolution. Getting this wrong points a suite that
// truncates and rewrites at whatever database the developer had open, so the failure mode is
// losing the demo data an hour before presenting it. Two rules, both structural:
//   1. the database name must end in `_test`
//   2. it must not be the DATABASE_URL written in `.env`
//
// Rule 2 reads the FILE rather than `process.env`, on purpose. Once the suite has pointed the
// process at the test database, `process.env.DATABASE_URL` legitimately equals the test URL,
// and a guard comparing against it would fire on its own second call — refusing to run for
// the exact reason everything was correct.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo-root `.env`, found by walking up rather than counting directories — the same
 *  approach as lib/config.ts, and for the same reason: a fixed `../../..` breaks silently
 *  when a folder is renamed, and the failure reads as a missing variable. */
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
  // Does not overwrite a variable that is already set, so `TEST_DATABASE_URL=… npm test`
  // and CI both still win over the file.
  if (file) process.loadEnvFile(file);
  return file;
}

/** DATABASE_URL as WRITTEN IN THE FILE — the developer's own database, whatever the running
 *  process has since been pointed at. Absent in CI, where there is no file and no local
 *  database to protect. */
function devUrlFromFile(file: string | null): string | null {
  if (!file) return null;
  const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(readFileSync(file, 'utf8'));
  return match?.[1]?.replace(/^["']|["']$/g, '') ?? null;
}

/** `postgresql://…/endur` → `postgresql://…/endur_test`. Used when TEST_DATABASE_URL is
 *  absent, so the common case needs no configuration and still cannot land on `endur`. */
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
  // which does not move: by the second call the running process has legitimately been pointed
  // at the test database, and a guard reading `devUrl` would fire for the exact reason
  // everything was correct.
  if (writtenDevUrl && url === writtenDevUrl) {
    throw new Error(
      'TEST_DATABASE_URL is the same as the DATABASE_URL in .env. The suite truncates and rewrites '
      + 'what it points at, so this would destroy the development database — and the demo seed with '
      + 'it. Point TEST_DATABASE_URL somewhere else (see .env.example).',
    );
  }

  return url;
}

/**
 * D-041 — the pool cap. It is arithmetic worth doing, and it is NOT what fixed the timeouts;
 * both halves of that sentence are the point.
 *
 * Vitest runs one worker per core (16 here) and each worker builds its OWN PrismaClient, whose
 * default pool is `num_cpus * 2 + 1` — 33 connections. Fifteen workers therefore ask a
 * `max_connections = 100` postgres for up to 495. That was the standing hypothesis for the
 * intermittent 5s timeouts, and it was WRONG: with `pool_timeout=3` in place, below vitest's
 * then-5s test timeout so pool starvation could finally announce itself, the timeouts kept
 * happening and NOT ONE of them reported "Timed out fetching a connection from the pool". The
 * cause was the test timeout having no headroom — see `vitest.config.ts`.
 *
 * The cap stays anyway, because 495 requested against 100 available is still a ceiling the
 * suite would eventually walk into. `connection_limit=5` × 15 workers = 75, which fits under
 * 100 with the developer's own session and a running dev server still connected; five per
 * worker is ample for a sequential test file plus the interactive transactions the booking
 * and register paths open — the widest concurrent burst in the suite is three (booking's
 * N+1 test at capacity 2).
 *
 * No `pool_timeout` here on purpose. Prisma's own default is 10s, and now that the test
 * timeout is 20s rather than 5s that default lands FIRST — so real starvation would name
 * itself, which is the property that was missing, without a second number to keep in sync.
 */
function withPoolCap(url: string): string {
  const parsed = new URL(url);
  // `??=` semantics by hand: an explicit TEST_DATABASE_URL that already tunes the pool is the
  // author saying something, and this is a default, not an override.
  if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '5');
  return parsed.toString();
}

export function testDatabaseUrl(): string {
  const file = loadRepoEnv();

  const current = process.env.DATABASE_URL;
  if (!current) throw new Error('DATABASE_URL is not set, so there is nothing to derive a test database from.');

  // The cap goes on AFTER the guards, never before: rule 2 compares the resolved URL against
  // the one written in `.env`, and a URL carrying query parameters the file's does not would
  // never be equal to it — which is a guard that stops firing because of a performance tweak.
  return withPoolCap(resolveTestUrl(current, process.env.TEST_DATABASE_URL, devUrlFromFile(file)));
}
