import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // D-004. globalSetup creates and migrates the test database; setupFiles points each
    // worker at it before lib/config.ts can read the repo .env. Read test/database.ts —
    // both refuse to run against the development database rather than trusting a name.
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
