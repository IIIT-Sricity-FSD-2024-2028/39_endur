// Prisma settings: where the schema, migrations and seed live, plus the repo-root .env.
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// A real environment variable beats the .env file, so a command never hits the wrong database.
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
