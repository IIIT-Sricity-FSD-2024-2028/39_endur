// Structured JSON logs. One logger, configured once, writing to more than one place.
//
// 18 §2: stdout AND two rotating files, never one instead of the other. stdout is what
// `npm run dev` and any container platform read; the files are what survives a restart and
// what an evaluator can open. `pino.multistream` gives both from a single logger, so there
// is still exactly one format — the property this file existed to protect before it had a
// destination at all.
//
//   logs/app-<date>.log      everything at LOG_LEVEL and above
//   logs/error-<date>.log    warn and above only
//
// One LOGGER, two RENDERINGS. stdout gets pino's JSON, unchanged, because that is what a
// container platform and every log pipeline expects to ingest. The files get the bracketed
// human line from `logFormat.ts`, because their reader is a person during an incident. This
// is not two formats in the old sense — the fields are identical and `logs/parser.ts` reads
// the file form back into the same record — it is one record, rendered for its audience.
//
// The second file is not duplication. "Logs are stored" and "error information is stored"
// are two requirements with two readers, and finding a stack trace should not mean grepping
// a hundred megabytes of 200 OK. Every error line is in both; error-*.log is a filtered
// view, not a move.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, multistream } from 'pino';
import type { DestinationStream, Level, LoggerOptions, StreamEntry } from 'pino';
import { config, isTest } from './config.js';
import { createRotatingStream } from './logFile.js';
import type { RotatingStream } from './logFile.js';
import { formatLogRecord } from './logFormat.js';

/** `src/backend/logs`, resolved from THIS file rather than from cwd. `npm run dev -w
 *  @endur/api` and a root-level `npm test` have different working directories, and a
 *  relative default would put logs in two different places depending on how you started. */
const defaultDir = path.resolve(fileURLToPath(import.meta.url), '../../logs');

export const logDir = config.LOG_DIR ? path.resolve(config.LOG_DIR) : defaultDir;

// A test run should not leave fourteen days of files behind, so file logging is off under
// NODE_ENV=test unless something explicitly asks for it (18 §5).
export const logToFile = config.LOG_TO_FILE ?? !isTest;

/** Exported so the test exercises the REAL wiring rather than a copy of it. A test that
 *  rebuilds the stream list by hand proves only that the test can build a stream list. */
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
    // warn and above. A 403 is a warn (18 §4), so error-*.log carries refusals as well as
    // failures — which is what you want when the question is "why did that not work".
    { level: 'warn', stream: formatted(createRotatingStream({ ...shared, prefix: 'error' })) },
  );
  return streams;
}

/** Renders each record on its way to disk. Rotation still counts the bytes it actually
 *  writes, because the formatting happens BEFORE the rotating stream sees the chunk — a
 *  wrapper on the other side would have made `maxBytes` a measure of a string nobody stored. */
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

/** Also exported for the test. The redact list is the one thing here that MUST be proven
 *  against the real object rather than a lookalike — a test that builds its own options is
 *  a test of its own options. */
export const loggerOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  // Pretty output in dev would need a transport dependency; JSON is readable enough and
  // is what any real log pipeline wants. Keep one format so dev and prod behave alike.
  // `pid` because the file format prints it and a fabricated one would be a lie: a log file
  // spans restarts, and "which process wrote this" is the question you ask when two of them
  // are running. `hostname` stays off — one machine, and it is noise on every line.
  base: { env: config.NODE_ENV, pid: process.pid },
  redact: {
    // Belt and braces before; load-bearing now. requestLogger already never passes a
    // body, but disk is permanent and stdout is not: a mistake here is fourteen days of
    // retained files rather than one terminal session (18 §3).
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', 'passwordHash'],
    remove: true,
  },
};

export const logger = pino(
  loggerOptions,
  // `dedupe: false` is the default and is what we want: a warn belongs in app-*.log AND in
  // error-*.log. Dedupe would send it only to the highest-level stream.
  multistream(streams, { dedupe: false }),
);
