// The two-minute check that cost a whole demo run. D-049, F3 of Mithil/demo_college_run.md.
//
// The Prisma client is generated and the database is migrated by two SEPARATE commands, and
// a branch that adds a model needs both. Miss the migration and a query fails against a
// table that is not there; miss the generate and `prisma.notification` is `undefined`, which
// surfaces as `500 — Cannot read properties of undefined (reading 'findMany')` on a route
// whose code is correct.
//
// `predev` now runs `prisma generate`, which closes the second half at the only moment that
// works on Windows (tsx holds the query-engine DLL open once the watcher is running). This
// closes the first half by SAYING SO at boot rather than at the first request from the
// screen that happens to need the new table.
//
// A WARNING AND NOT AN EXIT. The dev server is often started deliberately against a database
// one migration behind, and refusing to boot would make that impossible. It is also never
// run in production — `migrate deploy` is a deploy step there, and this reads the filesystem.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { appliedMigrations } from './graph.js';

const MIGRATIONS = path.join(import.meta.dirname, '..', 'database', 'migrations');

/** The migration folders on disk that the database has no finished row for. */
export async function pendingMigrations(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS, { withFileTypes: true });
  const onDisk = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (onDisk.length === 0) return [];

  const done = new Set(await appliedMigrations());
  return onDisk.filter((name) => !done.has(name)).sort();
}

export async function warnOnPendingMigrations(): Promise<void> {
  try {
    const pending = await pendingMigrations();
    if (pending.length === 0) return;
    process.stderr.write(
      `\n  ${pending.length} migration(s) are NOT applied to this database:\n` +
        pending.map((name) => `    - ${name}\n`).join('') +
        '  Run `npx prisma migrate deploy` (from src/backend), then restart.\n' +
        '  Until then, anything touching the new tables answers 500.\n\n',
    );
  } catch {
    // No database, no migrations table, no permission — all of them are somebody else's
    // error message, and a preflight that crashes the boot it was meant to explain is worse
    // than no preflight.
  }
}
