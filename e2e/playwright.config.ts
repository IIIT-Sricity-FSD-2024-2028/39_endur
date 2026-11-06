// End-to-end: the real API and the real web app in a real browser, against a database of
// their own (`endur_e2e`, rebuilt by scripts/e2e-db.mjs before every run). The ports are not
// the dev ones, so this runs beside `npm run dev` without either noticing the other.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The same .env the app and scripts/e2e-db.mjs read, so all three agree on the database.
const envFile = path.resolve(import.meta.dirname, '../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const API_PORT = 4100;
const WEB_PORT = 5180;

const databaseUrl = (): string => {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/endur');
  url.pathname = '/endur_e2e';
  return url.toString();
};

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  testIgnore: ['dist-types/**'],
  // One browser at a time against one shared server: the tests read each other's seeded
  // organisations, and a demo path is a sequence, not a race.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx server.ts',
      cwd: '../src/backend',
      url: `http://localhost:${API_PORT}/api/v1/auth/csrf`,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl(),
        PUBLIC_BASE_URL: `http://localhost:${WEB_PORT}`,
        LOG_TO_FILE: 'false',
        LOG_LEVEL: 'warn',
        // Every test signs in, several times over; the production limit is not under test here.
        RATE_LIMIT_MAX: '10000',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '../src/frontend',
      url: `http://localhost:${WEB_PORT}`,
      env: { API_BASE_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
