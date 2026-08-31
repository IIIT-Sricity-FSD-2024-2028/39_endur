// Runs once, before any worker starts: creates the test database if it is missing and migrates it,
// so `npm test` works on a fresh clone with no setup step.
// It uses migrate deploy and never migrate dev, which would offer to generate a migration from drift.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { nameOf, testDatabaseUrl } from './database.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// CREATE DATABASE cannot run inside the database being created, so this connects to the server's default one.
async function createIfMissing(url: string): Promise<boolean> {
  const name = nameOf(url);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount) return false;
    // The name comes from our own env and already ends in _test, but it is still an identifier going
    // into DDL, so it is quoted rather than interpolated raw.
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

  // Prisma is run through node rather than npx, which is a Windows portability fix: npx is a shell
  // script that cannot be executed directly, and the .cmd version cannot be spawned without a shell.
  const prismaBin = createRequire(import.meta.url).resolve('prisma/build/index.js');

  execFileSync(process.execPath, [prismaBin, 'migrate', 'deploy', '--config', path.join(backendRoot, 'prisma.config.ts')], {
    cwd: backendRoot,
    // The child inherits the OVERRIDE rather than the .env value, which is what prisma.config.ts allows for.
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  // Workers are forked after this returns, so they inherit the corrected URL - and setup.ts sets it again
  // per worker anyway: this file guarantees the database exists, that one guarantees nothing reaches past it.
  process.env.DATABASE_URL = url;
}
