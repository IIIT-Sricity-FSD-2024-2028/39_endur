// Bootstrap and graceful shutdown. config is imported first and parses at module load,
// so an invalid environment fails before anything binds a port (14 §5).
import { config } from './lib/config.js';
import { createApp } from './app.js';

const server = createApp().listen(config.PORT, () => {
  process.stdout.write(`endur api listening on :${config.PORT} [${config.NODE_ENV}]\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
