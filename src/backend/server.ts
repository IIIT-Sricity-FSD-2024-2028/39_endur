// Starts the server. config is imported first, so a bad .env fails before any port is opened.
import { config } from './lib/config.js';
import { createApp } from './app.js';
import { warnOnPendingMigrations } from './db/preflight.js';

const server = createApp().listen(config.PORT, () => {
  process.stdout.write(`endur api listening on :${config.PORT} [${config.NODE_ENV}]\n`);
  // Checked after the port is bound, so a slow database delays only the warning, not startup.
  if (config.NODE_ENV !== 'production') void warnOnPendingMigrations();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
