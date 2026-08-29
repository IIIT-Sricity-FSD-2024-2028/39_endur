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
  },
});
