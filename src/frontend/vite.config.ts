/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express app so the browser sees one origin.
// That is not a convenience: same-origin is what makes the session cookie (DEC-014)
// and the CSRF double-submit work identically in dev and in production.
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the LAN, not only on loopback — `DEC-086`, `OPEN-002`. The QR beat needs a
    // phone on the same wifi to reach this server; without this it can resolve the address
    // in the QR and still get nothing, which is the same failure one layer down. The
    // backend rewrites a loopback PUBLIC_BASE_URL to the same LAN address in development,
    // so the two halves agree without either being configured by hand.
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_BASE_URL ?? 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  test: {
    // Real DOM. Testing behaviour rather than rendering (51 §5) still needs somewhere for
    // the behaviour to happen — focus, cookies, and keyboard events all live here.
    environment: 'jsdom',
    globals: true,
    css: false,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'dist-types', 'dist-config'],

    // D-041, the frontend half — and it is the same arithmetic as the backend's, not a
    // sympathetic copy. `<PaymentDialog>` runs a deliberate ~700ms simulated capture and a
    // ~1500ms success overlay on REAL timers (fake ones fight `waitFor`), so every test in
    // `Start.test.tsx` that presses Pay costs ~2.3s of wall clock on an idle machine. Against
    // vitest's 5s default that is half the budget gone before 68 files start competing, and
    // the observed failure was exactly that: one assertion in that file failed in a full run
    // and the same file passed 16/16 alone, twice.
    //
    // The honest fix would be to make the dialog's two delays injectable so the tests do not
    // spend 15s of real time waiting for an animation. That is a change to product code for
    // the benefit of tests and belongs in its own task; until then this is headroom, and
    // headroom is not a retry — a component that genuinely never resolves still fails.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
