/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express app so the browser sees one origin.
// That is not a convenience: same-origin is what makes the session cookie (DEC-014)
// and the CSRF double-submit work identically in dev and in production.
export default defineConfig({
  plugins: [react()],
  server: {
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
