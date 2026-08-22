// Runs once, before any worker starts. Creates the test database if it is not there and
// brings it up to the current migration — so `npm test` on a fresh clone works with no
// setup step, which is the only version of this that people actually keep using.
//
// `migrate deploy`, never `migrate dev`: deploy applies what exists and nothing else. `dev`
// would offer to GENERATE a migration from a drifted schema, and a test run is the last
// place that should be possible.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { nameOf, testDatabaseUrl } from './database.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** CREATE DATABASE cannot run inside the database being created, so this connects to the
 *  server's default `postgres` and does it from there. */
async function createIfMissing(url: string): Promise<boolean> {
  const name = nameOf(url);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount) return false;
    // The name comes from our own env and is already checked to end in `_test`, but it is
    // still an identifier going into DDL, so it is quoted rather than interpolated raw.
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    return true;
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();

  const created = await createIfMissing(url);
  console.log(`[test-db] ${nameOf(url)} ${created ? 'created' : 'already there'}`);

  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--config', path.join(backendRoot, 'prisma.config.ts')], {
    cwd: backendRoot,
    // The child inherits the OVERRIDE, not the .env value — prisma.config.ts is written to
    // let a real environment variable win, which is what makes this possible at all.
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  // Workers are forked after this returns, so they inherit the corrected value. setup.ts
  // sets it again per worker anyway: this file guarantees the database EXISTS, that one
  // guarantees nothing can reach past it to `endur`.
  process.env.DATABASE_URL = url;
}
