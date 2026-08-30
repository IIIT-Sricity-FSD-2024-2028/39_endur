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

    // D-041 — and the filed diagnosis ("a flake") was wrong, so this is the measurement
    // rather than a nudge. Every full run failed ONE test with a 5009ms timeout, a different
    // innocent test each time, each passing alone. That reads as flakiness and is not: these
    // are INTEGRATION tests, and the heaviest of them register two organisations end to end.
    // Timed on an IDLE machine, the slowest single test is 3361ms and four are over 2.5s —
    // so vitest's 5s default was already spending two thirds of its budget before fifteen
    // workers started competing for sixteen cores. Whichever test is slowest when the
    // machine is busiest loses; that is a lottery, not a bug, and no amount of re-running
    // finds anything because there is nothing there to find.
    //
    // 20s is ~6x the measured worst case, which leaves room for a slower machine and for the
    // suite to keep growing, while still failing FAST enough to be useful — a genuine hang
    // (a deadlocked row lock, an unresolved promise) still reports in twenty seconds rather
    // than sitting there. The hook timeout moves with it because the expensive `setUpOrg()`
    // calls live in `beforeAll` as often as in the body, and its 10s default has the same
    // too-little-headroom problem one level up.
    //
    // NOT a retry. `retry: 1` would have made the symptom disappear tonight and hidden every
    // real race the suite exists to catch — including the booking one T-095 found.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
