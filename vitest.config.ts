// The root test config — and it exists to close `D-037`, not to add a convenience.
//
// `T-048` gave the backend suite a real guard: `test/globalSetup.ts` creates and migrates a
// separate database, `test/setup.ts` points every worker at it before `lib/config.ts` can
// read the repo `.env`, and both refuse to run against the development database rather than
// trusting a name. That guard is declared in `src/backend/vitest.config.ts`.
//
// There was no config here. So `npx vitest run` from the repo root — the shortest and most
// natural thing to type — loaded no config, ran no `setupFiles`, and pointed a suite that
// truncates and rewrites at the DEVELOPMENT database. On 25 Aug it did exactly that: 65
// organisations named `org-n-<epoch>-<random>` and 38 stray platform users, four days after
// `D-004` was supposedly closed. A guard a shorter command skips is not a guard.
//
// The fix is not another check. It is making the root command CORRECT: both workspaces are
// declared as projects, so running from here runs each one under its own config, with the
// backend's globalSetup in force. `npm test` (which delegates per workspace) is unchanged.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The frontend's test config lives in `vite.config.ts` — there is no second file to
    // point at, and duplicating its jsdom setup here is how the two would drift.
    projects: ['src/backend/vitest.config.ts', 'src/frontend/vite.config.ts'],
  },
});
