// The rotating log files, read safely. 72 § "The file name is the whole attack surface".
//
// `:file` becomes a filesystem read, and that is the one dangerous thing this module does.
// Guarded three ways, not one — rule 1 is what actually stops a bad name, rules 2 and 3 exist
// because rule 1 is a regex somebody will one day relax:
//
//   1 · ALLOWLIST BY PATTERN, never sanitise. `isAllowedName` reuses `filePattern` from
//       `lib/logFile.ts` — the exact regex the WRITER names files with — rather than a
//       second regex that can drift from it.
//   2 · RESOLVE AND COMPARE. `path.resolve(logDir, name)` must still sit inside `logDir`.
//   3 · NEVER A DIRECTORY LISTING FROM USER INPUT. `listLogFiles()` is the only thing that
//       reads `logDir`'s contents; a caller can only ever request a name that came from it.
//
// Reading is BOUNDED and BACKWARDS: the interesting line is the most recent one, so a page
// is built by reading fixed-size chunks from the end of the file, never the whole thing —
// this is what makes the acceptance line "a 10 MB file returns its most recent page without
// reading the whole file" true rather than aspirational.
import fs from 'node:fs';
import path from 'node:path';
import type { LogFileMeta, LogLine } from '@endur/shared';
import { logDir, logToFile } from '../../lib/logger.js';
import { filePattern } from '../../lib/logFile.js';
import { NotFoundError } from '../../lib/errors.js';
import { parseLogLine } from './parser.js';

const APP_PATTERN = filePattern('app');
const ERROR_PATTERN = filePattern('error');

/** Files above this size are not line-counted for the file list — counting is a full read
 *  and the list must stay cheap for the case (an incident) where somebody actually opens it. */
const LINE_COUNT_THRESHOLD_BYTES = 2 * 1024 * 1024;

/** Read in 64 KB chunks from the end. */
const CHUNK_BYTES = 64 * 1024;

/** A hard ceiling per call — not "never slurped" defeated by an unlucky filter, but bounded
 *  so one request cannot block the event loop scanning a whole large file synchronously. A
 *  filter that matches nothing in this window still returns a cursor; the client pages again. */
const MAX_BYTES_PER_CALL = 8 * 1024 * 1024;

export type LogFilters = {
  level?: number | undefined;
  status?: number | undefined;
  path?: string | undefined;
  orgId?: string | undefined;
  q?: string | undefined;
};

export type LogReadResult = {
  data: LogLine[];
  page: { nextCursor: string | null; hasMore: boolean };
};

function isAllowedName(name: string): boolean {
  return APP_PATTERN.test(name) || ERROR_PATTERN.test(name);
}

function streamAndDateOf(name: string): { stream: 'app' | 'error'; date: string } | null {
  const app = APP_PATTERN.exec(name);
  if (app?.[1]) return { stream: 'app', date: app[1] };
  const err = ERROR_PATTERN.exec(name);
  if (err?.[1]) return { stream: 'error', date: err[1] };
  return null;
}

function countLines(fullPath: string): number {
  const content = fs.readFileSync(fullPath, 'utf8');
  return content.split('\n').filter((line) => line.length > 0).length;
}

/**
 * `72` § Interactions — grouped by stream, newest first, `error-*.log` listed first: finding
 * an error must not mean grepping megabytes of `200 OK`. Reads `logDir` itself, once; nothing
 * downstream of this ever turns a client-supplied name into a directory scan.
 */
export function listLogFiles(): LogFileMeta[] {
  if (!logToFile || !fs.existsSync(logDir)) return [];

  const metas: LogFileMeta[] = [];
  for (const name of fs.readdirSync(logDir)) {
    const meta = streamAndDateOf(name);
    if (!meta) continue;
    const fullPath = path.join(logDir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue; // rotated away between readdir and stat — not this call's problem
    }
    metas.push({
      name,
      stream: meta.stream,
      date: meta.date,
      bytes: stat.size,
      lines: stat.size <= LINE_COUNT_THRESHOLD_BYTES ? countLines(fullPath) : null,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  metas.sort((a, b) => {
    if (a.stream !== b.stream) return a.stream === 'error' ? -1 : 1;
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });
  return metas;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number | null {
  try {
    const n = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function matchesFilters(line: LogLine, raw: string, filters: LogFilters): boolean {
  // Threshold, not equality: "level >= 40" is the useful question ("show me warnings and
  // worse"), the same convention every level-based log viewer uses.
  if (filters.level !== undefined && line.level < filters.level) return false;
  if (filters.status !== undefined && line.status !== filters.status) return false;
  if (filters.path !== undefined && !(line.path ?? '').startsWith(filters.path)) return false;
  if (filters.orgId !== undefined && line.orgId !== filters.orgId) return false;
  if (filters.q) {
    if (!raw.toLowerCase().includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

/**
 * Reads one page from the end of `fullPath`, backwards, applying `filters` server-side as it
 * goes. `cursor`, when present, is the exact byte offset the previous page stopped at — so a
 * chunk this call only partially used is simply re-read from the same offset next time,
 * rather than needing to remember where inside a chunk it left off.
 */
function tailRead(
  fullPath: string,
  filters: LogFilters,
  cursor: string | undefined,
  limit: number,
  fallbackDate: string,
): LogReadResult {
  const size = fs.statSync(fullPath).size;
  const startPosition = cursor === undefined ? size : decodeCursor(cursor);
  if (startPosition === null || startPosition > size) {
    // A cursor pointing past the file's current size means the file was rotated or
    // truncated since the page it came from — the same "gone" the caller sees for a name
    // that no longer exists at all.
    throw new NotFoundError('That file has rotated away.');
  }

  const fd = fs.openSync(fullPath, 'r');
  try {
    let position = startPosition;
    let leftover = '';
    let bytesRead = 0;
    const matched: LogLine[] = [];

    while (position > 0 && matched.length < limit && bytesRead < MAX_BYTES_PER_CALL) {
      const readSize = Math.min(CHUNK_BYTES, position);
      const start = position - readSize;
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, start);
      bytesRead += readSize;
      // `buf` is EARLIER in the file than `leftover` (the previous chunk's still-incomplete
      // first line), so `buf`'s text comes first when the two are joined.
      const text = buf.toString('utf8') + leftover;
      const rows = text.split('\n');
      leftover = rows.shift() ?? ''; // still possibly incomplete unless start === 0
      position = start;

      for (let i = rows.length - 1; i >= 0 && matched.length < limit; i -= 1) {
        const raw = rows[i];
        if (!raw || raw.length === 0) continue;
        const parsed = parseLogLine(raw, fallbackDate);
        if (matchesFilters(parsed, raw, filters)) matched.push(parsed);
      }
    }

    if (position === 0 && leftover.length > 0 && matched.length < limit) {
      const parsed = parseLogLine(leftover, fallbackDate);
      if (matchesFilters(parsed, leftover, filters)) matched.push(parsed);
      leftover = '';
    }

    const hasMore = position > 0;
    return { data: matched, page: { nextCursor: hasMore ? encodeCursor(position) : null, hasMore } };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * `72` § Interactions — "click a `requestId` and the view collapses to that one request,
 * across both files." A request's app-line and any warn-or-above line it produced share a
 * `requestId` but live in different files of the SAME day, so this reads every rotation of
 * both streams for that date in full rather than paginating — the files are size-bounded per
 * rotation and there are normally one to a few per stream per day, so this stays small even
 * though it is a deliberate exception to "never slurped" (72 § "The file name is the whole
 * attack surface").
 */
function crossStreamRequestRead(date: string, requestId: string): LogLine[] {
  if (!fs.existsSync(logDir)) return [];
  const names = fs.readdirSync(logDir).filter((name) => streamAndDateOf(name)?.date === date).sort();

  const results: LogLine[] = [];
  for (const name of names) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(logDir, name), 'utf8');
    } catch {
      continue;
    }
    for (const raw of content.split('\n')) {
      if (raw.length === 0) continue;
      const parsed = parseLogLine(raw, date);
      if (parsed.requestId === requestId) results.push(parsed);
    }
  }
  results.sort((a, b) => a.at.localeCompare(b.at));
  return results;
}

export type LogReadOptions = LogFilters & {
  requestId?: string | undefined;
  cursor?: string | undefined;
  limit: number;
};

export function readLogFile(fileName: string, opts: LogReadOptions): LogReadResult {
  if (!isAllowedName(fileName)) throw new NotFoundError('That file has rotated away.');

  const resolved = path.resolve(logDir, fileName);
  const resolvedDir = path.resolve(logDir);
  // Rule 1 already makes this unreachable — it stays as the belt to rule 1's braces.
  if (resolved !== path.join(resolvedDir, fileName)) throw new NotFoundError('That file has rotated away.');

  // `lstat`, not `stat` — a symlink at an otherwise-allowed name would pass every check
  // above and then read whatever it actually points to. `lstat` sees the link itself, and a
  // plain file is the only thing `isFile()` is true for there.
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(resolved);
  } catch {
    throw new NotFoundError('That file has rotated away.');
  }
  if (!lstat.isFile()) throw new NotFoundError('That file has rotated away.');

  const meta = streamAndDateOf(fileName);
  if (!meta) throw new NotFoundError('That file has rotated away.');

  if (opts.requestId) {
    const data = crossStreamRequestRead(meta.date, opts.requestId);
    return { data, page: { nextCursor: null, hasMore: false } };
  }

  return tailRead(resolved, opts, opts.cursor, opts.limit, meta.date);
}
