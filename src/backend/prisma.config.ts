// Prisma settings: where the schema, migrations and seed live, plus the repo-root .env.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// A real environment variable beats the .env file, so a command never hits the wrong database.
// On a host (Render, CI) there is no .env file: the variables come from the environment itself.
const envFile = path.join(import.meta.dirname, '../../.env');
if (existsSync(envFile)) {
  const fromEnvironment = { ...process.env };
  process.loadEnvFile(envFile);
  Object.assign(process.env, fromEnvironment);
}

export default defineConfig({
  schema: path.join(import.meta.dirname, 'database', 'schema.prisma'),
  migrations: {
    path: path.join(import.meta.dirname, 'database', 'migrations'),
    seed: 'tsx database/seed/index.ts',
  },
});
