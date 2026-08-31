// One logger, writing to three places at once:
//   stdout                 pino's JSON, for the terminal and any container platform
//   logs/app-<date>.log    everything at LOG_LEVEL and above
//   logs/error-<date>.log  warnings and errors only, so a stack trace is easy to find
// The files carry the same fields, rendered as a human-readable line by logFormat.ts.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, multistream } from 'pino';
import type { DestinationStream, Level, LoggerOptions, StreamEntry } from 'pino';
import { config, isTest } from './config.js';
import { createRotatingStream } from './logFile.js';
import type { RotatingStream } from './logFile.js';
import { formatLogRecord } from './logFormat.js';

// src/backend/logs, resolved from this file, so the folder does not move with the working directory.
const defaultDir = path.resolve(fileURLToPath(import.meta.url), '../../logs');

export const logDir = config.LOG_DIR ? path.resolve(config.LOG_DIR) : defaultDir;

// File logging is off during tests, so a test run leaves no fortnight of files behind.
export const logToFile = config.LOG_TO_FILE ?? !isTest;

// Builds the list of log destinations. Exported so the test exercises the real wiring.
export function createLogStreams(opts: {
  dir: string;
  level: Level;
  maxBytes: number;
  retentionDays: number;
  toFile: boolean;
  stdout?: DestinationStream;
}): StreamEntry[] {
  const streams: StreamEntry[] = [
    { level: opts.level, stream: opts.stdout ?? process.stdout },
  ];
  if (!opts.toFile) return streams;

  const shared = { dir: opts.dir, maxBytes: opts.maxBytes, retentionDays: opts.retentionDays };
  streams.push(
    { level: opts.level, stream: formatted(createRotatingStream({ ...shared, prefix: 'app' })) },
    // Warnings and above. A 403 counts as a warning, so this file carries refusals as well as failures.
    { level: 'warn', stream: formatted(createRotatingStream({ ...shared, prefix: 'error' })) },
  );
  return streams;
}

// Renders each record into the file format on its way to disk, before rotation counts the bytes.
function formatted(stream: RotatingStream): DestinationStream {
  return { write: (chunk: string) => stream.write(formatLogRecord(chunk)) };
}

const streams = createLogStreams({
  dir: logDir,
  level: config.LOG_LEVEL,
  maxBytes: Math.round(config.LOG_MAX_SIZE_MB * 1024 * 1024),
  retentionDays: config.LOG_RETENTION_DAYS,
  toFile: logToFile,
});

// Exported for the test as well: the redact list has to be proven against the real options object.
export const loggerOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  // One JSON format in dev and prod. pid is included because a log file spans restarts.
  base: { env: config.NODE_ENV, pid: process.pid },
  redact: {
    // Never write cookies, tokens or passwords to disk: files last fourteen days, a terminal does not.
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'passwordHash'],
    remove: true,
  },
};

export const logger = pino(
  loggerOptions,
  // dedupe: false, so a warning lands in app.log AND error.log, not only the highest-level stream.
  multistream(streams, { dedupe: false }),
);
