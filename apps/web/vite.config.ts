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
});
