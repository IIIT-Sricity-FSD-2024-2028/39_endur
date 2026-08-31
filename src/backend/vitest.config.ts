import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // globalSetup makes the test database; setup.ts points each worker at it before config loads.
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],

    // 20s instead of the 5s default: these are integration tests and the slowest takes about 3.4s.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
