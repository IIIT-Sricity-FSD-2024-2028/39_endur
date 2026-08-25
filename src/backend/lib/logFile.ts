// A rotating log file, hand-rolled. 18 §2.
//
// Why not a dependency: `pino-roll` and `rotating-file-stream` both do this, and both are
// another package to install, audit and explain for roughly eighty lines of behaviour we
// need to be able to describe anyway. The rotation policy IS the graded requirement —
// "stored in files at regular intervals" — so it should be readable, not vendored.
//
// Writes are SYNCHRONOUS on purpose. An async WriteStream buffers, and the lines you most
// want on disk are the ones written immediately before the process died — precisely the
// ones a buffer loses. At this volume the blocking cost is a few microseconds per line;
// losing the last error before a crash costs an evening.
import fs from 'node:fs';
import path from 'node:path';

export type RotatingStreamOptions = {
  dir: string;
  /** `app` or `error`. Becomes `<prefix>-<date>.log`. */
  prefix: string;
  maxBytes: number;
  retentionDays: number;
};

export type RotatingStream = {
  write(chunk: string): void;
  /** The file currently being appended to, or null if file logging has failed off. */
  currentPath(): string | null;
  close(): void;
};

/** Local date, not UTC: a file called `app-2026-08-23.log` should be today's by the clock
 *  on the wall of the person reading it. */
export function dateKey(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

const fileName = (prefix: string, day: string, index: number) =>
  index === 0 ? `${prefix}-${day}.log` : `${prefix}-${day}.${index}.log`;

// `app-2026-08-23.log` and `app-2026-08-23.4.log` both belong to that day.
//
// Exported (72 §"The file name is the whole attack surface") so the platform log reader's
// allowlist is THIS regex, not a second one that can drift from what the writer actually
// names files.
export const filePattern = (prefix: string) =>
  new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2})(?:\\.(\\d+))?\\.log$`);

export function createRotatingStream(opts: RotatingStreamOptions): RotatingStream {
  const { dir, prefix, maxBytes, retentionDays } = opts;

  let fd: number | null = null;
  let day = '';
  let index = 0;
  let bytes = 0;
  let failed = false;

  /** A logging failure must never take the application down (18 §2). It fails OFF, once,
   *  loudly, to stdout — which is still a destination, so nothing is silently lost. */
  function failOff(err: unknown): void {
    if (failed) return;
    failed = true;
    closeFd();
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      `${JSON.stringify({
        level: 'warn',
        msg: 'log file disabled; continuing to stdout only',
        prefix,
        dir,
        err: message,
      })}\n`,
    );
  }

  function closeFd(): void {
    if (fd === null) return;
    try {
      fs.closeSync(fd);
    } catch {
      // Closing a broken descriptor is not worth a second failure path.
    }
    fd = null;
  }

  function open(nextDay: string): void {
    closeFd();
    fs.mkdirSync(dir, { recursive: true });

    // Resume the day's newest file rather than truncating it: a restart mid-morning must
    // not lose the morning. Skip forward past anything already at the size limit.
    let candidate = 0;
    let size = 0;
    for (;;) {
      const full = path.join(dir, fileName(prefix, nextDay, candidate));
      const stat = fs.existsSync(full) ? fs.statSync(full) : null;
      if (!stat) {
        size = 0;
        break;
      }
      if (stat.size < maxBytes) {
        size = stat.size;
        break;
      }
      candidate += 1;
    }

    fd = fs.openSync(path.join(dir, fileName(prefix, nextDay, candidate)), 'a');
    day = nextDay;
    index = candidate;
    bytes = size;
  }

  /** Runs on every day-boundary rotation — the one moment a scan is free. */
  function purge(): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const pattern = filePattern(prefix);
    for (const entry of fs.readdirSync(dir)) {
      const match = pattern.exec(entry);
      if (!match) continue;
      // Parsed from the NAME, not from mtime: a file touched by a backup tool is still
      // last Tuesday's log, and mtime would keep it forever.
      const stamp = Date.parse(`${match[1]}T00:00:00`);
      if (Number.isNaN(stamp) || stamp >= cutoff) continue;
      try {
        fs.unlinkSync(path.join(dir, entry));
      } catch {
        // A file we cannot delete is a disk-space problem, not a logging problem.
      }
    }
  }

  try {
    open(dateKey());
    purge();
  } catch (err) {
    failOff(err);
  }

  return {
    write(chunk: string): void {
      if (failed) return;
      try {
        const today = dateKey();
        if (today !== day) {
          open(today);
          purge();
        } else if (bytes + Buffer.byteLength(chunk) > maxBytes) {
          index += 1;
          closeFd();
          fd = fs.openSync(path.join(dir, fileName(prefix, day, index)), 'a');
          bytes = 0;
        }
        if (fd === null) return;
        fs.writeSync(fd, chunk);
        bytes += Buffer.byteLength(chunk);
      } catch (err) {
        failOff(err);
      }
    },
    currentPath: () => (failed || fd === null ? null : path.join(dir, fileName(prefix, day, index))),
    close: closeFd,
  };
}
