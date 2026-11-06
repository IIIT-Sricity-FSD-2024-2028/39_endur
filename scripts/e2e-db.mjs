// Gives the end-to-end tests a database of their own, rebuilt from nothing on every run:
// dropped, created, migrated (`migrate deploy`, never `dev`), and seeded with the demo
// organisations. The tests then sign in as the seeded accounts.
//
// It will only ever touch a database whose name ends in `_e2e`, the same guard the backend
// suite keeps on `_test`: a typo in an environment variable must not wipe somebody's data.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

export const e2eUrl = () => {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (or E2E_DATABASE_URL).');
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/endur_e2e';
  return url.toString();
};

const url = new URL(e2eUrl());
const name = decodeURIComponent(url.pathname.slice(1));
if (!name.endsWith('_e2e')) {
  console.error(`✗ Refusing to rebuild "${name}": the end-to-end database's name must end in _e2e.`);
  process.exit(1);
}

const server = new URL(url);
server.pathname = '/postgres';
const client = new pg.Client({ connectionString: server.toString() });
await client.connect();
const quoted = `"${name.replace(/"/g, '""')}"`;
await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
await client.query(`CREATE DATABASE ${quoted}`);
await client.end();

const backend = path.join(root, 'src/backend');
const env = { ...process.env, DATABASE_URL: url.toString() };
const bin = (tool) => path.join(root, 'node_modules/.bin', tool);
execFileSync(bin('prisma'), ['migrate', 'deploy', '--config', 'prisma.config.ts'], { cwd: backend, env, stdio: 'inherit' });
execFileSync(bin('tsx'), ['database/seed/index.ts'], { cwd: backend, env, stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`✓ ${name} rebuilt and seeded`);
