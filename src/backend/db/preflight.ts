// Boot-time check that warns when migration folders on disk have not been applied to this database.
// A warning and never an exit, because a developer often runs against a database one migration behind.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { appliedMigrations } from './graph.js';

const MIGRATIONS = path.join(import.meta.dirname, '..', 'database', 'migrations');

// The migration folders on disk that the database has no finished row for.
export async function pendingMigrations(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS, { withFileTypes: true });
  const onDisk = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (onDisk.length === 0) return [];

  const done = new Set(await appliedMigrations());
  return onDisk.filter((name) => !done.has(name)).sort();
}

// Prints a warning listing any migrations still waiting to be applied.
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
    // No database or no permission is somebody else's error; a preflight must never break the boot.
  }
}
