// Prisma reads .env from ITS OWN directory by default; ours lives once at the repo root
// (03 §4) and duplicating it would create two files to keep in sync. Loading it here is
// the single place that gap is bridged.
//
// This file also replaces the deprecated `package.json#prisma` block.
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// A real environment variable always wins over the file. Overriding one that was set
// deliberately — in CI, or `DATABASE_URL=... prisma migrate` against a scratch database —
// would point the command at the wrong database, which is the worst possible surprise
// from a migration tool.
const fromEnvironment = { ...process.env };
process.loadEnvFile(path.join(import.meta.dirname, '../../.env'));
Object.assign(process.env, fromEnvironment);

export default defineConfig({
  schema: path.join(import.meta.dirname, 'database', 'schema.prisma'),
  migrations: {
    path: path.join(import.meta.dirname, 'database', 'migrations'),
    seed: 'tsx database/seed/index.ts',
  },
});
