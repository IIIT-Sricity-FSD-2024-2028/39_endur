// Starts the server. config is imported first, so a bad .env fails before any port is opened.
import type { AddressInfo } from 'node:net';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { warnOnPendingMigrations } from './db/preflight.js';

// A TERMINAL THAT HAS GONE AWAY MUST NOT TAKE THE SERVER WITH IT. When the window running
// `npm run dev` is closed, every write to it fails with EIO (or EPIPE through a pipe), and an
// 'error' event nobody listens for kills the process. That is how the dev API kept dying with
// nothing in its log files. The files still get every line; only the terminal copy is lost.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EIO' || error.code === 'EPIPE') return;
    throw error;
  });
}

// WHATEVER STOPS THE PROCESS IS WRITTEN DOWN FIRST. The file stream writes synchronously, so
// the line is on disk before the exit.
const die = (message: string, error: unknown): never => {
  logger.fatal({ err: error }, message);
  process.exit(1);
};
process.on('uncaughtException', (error) => die('Uncaught exception: the API is stopping', error));
process.on('unhandledRejection', (reason) => die('Unhandled promise rejection: the API is stopping', reason));

/** Listening can fail, and the commonest way says exactly what to do about it. */
const startFailed = (error: NodeJS.ErrnoException): never =>
  die(
    error.code === 'EADDRINUSE'
      ? `Port ${config.PORT} is already in use: another API is still running, or something else holds it`
      : 'The server could not start',
    error,
  );

// Express 5 hands a failed listen to this callback (as well as emitting 'error').
const server = createApp().listen(config.PORT, (error?: Error) => {
  if (error) return startFailed(error);
  const { port } = server.address() as AddressInfo;
  process.stdout.write(`endur api listening on :${port} [${config.NODE_ENV}]\n`);
  logger.info({ port }, 'API listening');
  // Checked after the port is bound, so a slow database delays only the warning, not startup.
  if (config.NODE_ENV !== 'production') void warnOnPendingMigrations();
});

server.on('error', startFailed);

/** Long enough for a request in flight to finish; short enough that a restart is not left waiting. */
const SHUTDOWN_GRACE_MS = 5_000;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // close() waits for every open connection, and a keep-alive one (the dev proxy holds
    // several) can stay open indefinitely. Idle ones go now; busy ones get the grace period.
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, SHUTDOWN_GRACE_MS).unref();
  });
}
