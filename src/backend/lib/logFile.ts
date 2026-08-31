// A rotating log file, hand-written so the rotation policy is readable rather than vendored.
// Writes are synchronous on purpose: the lines you most want on disk are the ones written just before a crash.
import fs from 'node:fs';
import path from 'node:path';

export type RotatingStreamOptions = {
  dir: string;
  // 'app' or 'error'. Becomes <prefix>-<date>.log.
  prefix: string;
  maxBytes: number;
  retentionDays: number;
};

export type RotatingStream = {
  write(chunk: string): void;
  // The file being appended to right now, or null if file logging has failed off.
  currentPath(): string | null;
  close(): void;
};

// Today's date by the local clock, used in the file name.
export function dateKey(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

// The file name for a prefix, day and rotation index.
const fileName = (prefix: string, day: string, index: number) =>
  index === 0 ? `${prefix}-${day}.log` : `${prefix}-${day}.${index}.log`;

// Matches every file for one prefix, including same-day rollovers like app-2026-08-23.4.log.
// Exported so the log reader's allowlist is this same pattern and cannot drift from the writer.
export const filePattern = (prefix: string) =>
  new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2})(?:\\.(\\d+))?\\.log$`);

// Creates the stream: opens today's file, purges old ones, and rotates by day and by size.
export function createRotatingStream(opts: RotatingStreamOptions): RotatingStream {
  const { dir, prefix, maxBytes, retentionDays } = opts;

  let fd: number | null = null;
  let day = '';
  let index = 0;
  let bytes = 0;
  let failed = false;

  // Logging must never take the app down: it fails off once, loudly, and stdout keeps working.
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

// Opens, or resumes, the file for a given day.
  function open(nextDay: string): void {
    closeFd();
    fs.mkdirSync(dir, { recursive: true });

    // Resume the day's newest file instead of truncating it, skipping any that are already full.
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

  // Deletes files past the retention window. Runs at each day rollover, when a scan is free.
  function purge(): void {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const pattern = filePattern(prefix);
    for (const entry of fs.readdirSync(dir)) {
      const match = pattern.exec(entry);
      if (!match) continue;
      // The date comes from the NAME, not the file time, which a backup tool could have touched.
      const stamp = Date.parse(`${match[1]}T00:00:00`);
      if (Number.isNaN(stamp) || stamp >= cutoff) continue;
      try {
        fs.unlinkSync(path.join(dir, entry));
      } catch {
        // A file we cannot delete is a disk problem, not a logging problem.
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
