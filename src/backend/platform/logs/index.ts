// Reads the rotating log files for the operator console.
// The file name is the whole attack surface, so a name must match the writer's own pattern, must resolve
// inside the log folder, and can only ever come from our own directory listing.
// Reading is bounded and backwards: a page is built from chunks at the END of the file, never the whole file.
import fs from 'node:fs';
import path from 'node:path';
import type { LogFileMeta, LogLine } from '@endur/shared';
import { logDir, logToFile } from '../../lib/logger.js';
import { filePattern } from '../../lib/logFile.js';
import { NotFoundError } from '../../lib/errors.js';
import { parseLogLine } from './parser.js';

const APP_PATTERN = filePattern('app');
const ERROR_PATTERN = filePattern('error');

// Files above this size are not line-counted in the listing, because counting means reading all of it.
const LINE_COUNT_THRESHOLD_BYTES = 2 * 1024 * 1024;

// Read in 64 KB chunks, from the end.
const CHUNK_BYTES = 64 * 1024;

// A hard ceiling per call, so one request cannot scan a whole large file; the client simply pages again.
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

// Lists the log files, grouped by stream and newest first, with the error files first.
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
  // A threshold, not an equality: "level >= 40" means "warnings and worse".
  if (filters.level !== undefined && line.level < filters.level) return false;
  if (filters.status !== undefined && line.status !== filters.status) return false;
  if (filters.path !== undefined && !(line.path ?? '').startsWith(filters.path)) return false;
  if (filters.orgId !== undefined && line.orgId !== filters.orgId) return false;
  if (filters.q) {
    if (!raw.toLowerCase().includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

// Reads one page from the end of a file, applying the filters as it goes.
// The cursor is the byte offset of the OLDEST LINE the previous page returned - a line start, never a chunk start.
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
    // A cursor past the end of the file means the file has rotated or been truncated since.
    throw new NotFoundError('That file has rotated away.');
  }

  const fd = fs.openSync(fullPath, 'r');
  try {
    let position = startPosition;
    let leftover = '';
    let bytesRead = 0;
    const matched: LogLine[] = [];
    // Byte offset of the oldest line returned, which is what the next cursor is built from.
    let oldestReturned: number | null = null;

    while (position > 0 && matched.length < limit && bytesRead < MAX_BYTES_PER_CALL) {
      const readSize = Math.min(CHUNK_BYTES, position);
      const start = position - readSize;
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, start);
      bytesRead += readSize;
      // buf comes earlier in the file than leftover, so its text goes first when the two are joined.
      const text = buf.toString('utf8') + leftover;
      const rows = text.split('\n');
      leftover = rows.shift() ?? ''; // still possibly incomplete unless start === 0
      position = start;

      // Where each complete line starts, measured in BYTES, so an accented character cannot shift the cursor.
      const offsets: number[] = [];
      let at = position + Buffer.byteLength(leftover, 'utf8') + 1;
      for (const row of rows) {
        offsets.push(at);
        at += Buffer.byteLength(row, 'utf8') + 1;
      }

      for (let i = rows.length - 1; i >= 0 && matched.length < limit; i -= 1) {
        const raw = rows[i];
        if (!raw || raw.length === 0) continue;
        const parsed = parseLogLine(raw, fallbackDate);
        if (matchesFilters(parsed, raw, filters)) {
          matched.push(parsed);
          oldestReturned = offsets[i] ?? 0;
        }
      }
    }

    if (position === 0 && leftover.length > 0 && matched.length < limit) {
      const parsed = parseLogLine(leftover, fallbackDate);
      if (matchesFilters(parsed, leftover, filters)) {
        matched.push(parsed);
        oldestReturned = 0; // the file's first line, and there is nothing below it
      }
      leftover = '';
    }

    // Everything at or above this offset has been dealt with: either returned, or read and filtered out.
    const boundary =
      matched.length >= limit && oldestReturned !== null
        ? oldestReturned
        : position === 0
          ? 0
          : position + Buffer.byteLength(leftover, 'utf8') + 1;

    const hasMore = boundary > 0;
    return { data: matched, page: { nextCursor: hasMore ? encodeCursor(boundary) : null, hasMore } };
  } finally {
    fs.closeSync(fd);
  }
}

// Reads every file for one date and keeps the lines with one requestId, so a request can be followed across both streams.
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

// The three name guards, in one place, used by every entry point that opens a file.
function assertReadableName(fileName: string): { resolved: string; stream: 'app' | 'error'; date: string } {
  if (!isAllowedName(fileName)) throw new NotFoundError('That file has rotated away.');

  const resolved = path.resolve(logDir, fileName);
  const resolvedDir = path.resolve(logDir);
  // Rule 1 already makes this impossible; it stays as a second check.
  if (resolved !== path.join(resolvedDir, fileName)) throw new NotFoundError('That file has rotated away.');

  // lstat, not stat, so a symlink at an allowed name is seen as a link and refused.
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(resolved);
  } catch {
    throw new NotFoundError('That file has rotated away.');
  }
  if (!lstat.isFile()) throw new NotFoundError('That file has rotated away.');

  const meta = streamAndDateOf(fileName);
  if (!meta) throw new NotFoundError('That file has rotated away.');

  return { resolved, stream: meta.stream, date: meta.date };
}

export function readLogFile(fileName: string, opts: LogReadOptions): LogReadResult {
  const { resolved, date } = assertReadableName(fileName);

  if (opts.requestId) {
    const data = crossStreamRequestRead(date, opts.requestId);
    return { data, page: { nextCursor: null, hasMore: false } };
  }

  return tailRead(resolved, opts, opts.cursor, opts.limit, date);
}

// Export - downloading a log file as ndjson or csv.

// A hard ceiling on one export. A capped export says so in a trailing marker rather than ending silently.
export const EXPORT_MAX_LINES = 50_000;

export type LogExportOptions = LogFilters & { format: 'ndjson' | 'csv' };

export type LogExportResult = {
  body: string;
  contentType: string;
  fileName: string;
  lines: number;
  truncated: boolean;
};

// CSV has a fixed column set; the open-ended extra fields appear only in the ndjson export.
const CSV_COLUMNS = [
  'at', 'level', 'msg', 'requestId', 'method', 'path', 'status', 'durationMs',
  'orgId', 'principal', 'err.type', 'err.message',
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  // Anything that is not a scalar is written as JSON, not as [object Object].
  const text =
    typeof value === 'string' ? value
    : typeof value === 'number' || typeof value === 'boolean' ? String(value)
    : JSON.stringify(value);
  // Quote when the value could change the shape of the row, and double any quote inside it.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(line: LogLine): string {
  return CSV_COLUMNS.map((column) => {
    if (column === 'err.type') return csvCell(line.err?.type);
    if (column === 'err.message') return csvCell(line.err?.message);
    return csvCell((line as unknown as Record<string, unknown>)[column]);
  }).join(',');
}

// Reads the file FORWARD, oldest line first - the opposite of the viewer's page.
// A page on a screen wants the newest line at the top; a file handed to somebody else reads top to bottom.
function forwardRead(
  fullPath: string,
  filters: LogFilters,
  fallbackDate: string,
): { lines: LogLine[]; truncated: boolean } {
  const size = fs.statSync(fullPath).size;
  const fd = fs.openSync(fullPath, 'r');
  try {
    const lines: LogLine[] = [];
    let position = 0;
    let leftover = '';
    let truncated = false;

    while (position < size) {
      const readSize = Math.min(CHUNK_BYTES, size - position);
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, position);
      position += readSize;
      const rows = (leftover + buf.toString('utf8')).split('\n');
      // The last element is whatever is still mid-line, unless this was the final chunk.
      leftover = position < size ? (rows.pop() ?? '') : '';

      for (const raw of rows) {
        if (raw.length === 0) continue;
        const parsed = parseLogLine(raw, fallbackDate);
        if (!matchesFilters(parsed, raw, filters)) continue;
        if (lines.length >= EXPORT_MAX_LINES) {
          truncated = true;
          break;
        }
        lines.push(parsed);
      }
      if (truncated) break;
    }

    if (!truncated && leftover.length > 0 && lines.length < EXPORT_MAX_LINES) {
      const parsed = parseLogLine(leftover, fallbackDate);
      if (matchesFilters(parsed, leftover, filters)) lines.push(parsed);
    }

    return { lines, truncated };
  } finally {
    fs.closeSync(fd);
  }
}

// The same file and the same filters, in order, as a download.
// It reuses the read route's name guard by calling the same function: a second entry point that
// re-implemented the allowlist is exactly how a guard drifts.
export function exportLogFile(fileName: string, opts: LogExportOptions): LogExportResult {
  const { resolved, date } = assertReadableName(fileName);
  const { lines, truncated } = forwardRead(resolved, opts, date);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (opts.format === 'csv') {
    const rows = [CSV_COLUMNS.join(','), ...lines.map(csvRow)];
    if (truncated) rows.push(`# truncated at ${EXPORT_MAX_LINES} lines`);
    return {
      body: `${rows.join('\n')}\n`,
      contentType: 'text/csv; charset=utf-8',
      fileName: `${fileName}.${stamp}.csv`,
      lines: lines.length,
      truncated,
    };
  }

  const rows = lines.map((line) => JSON.stringify(line));
  if (truncated) rows.push(JSON.stringify({ truncated: true, limit: EXPORT_MAX_LINES }));
  return {
    body: `${rows.join('\n')}\n`,
    contentType: 'application/x-ndjson; charset=utf-8',
    fileName: `${fileName}.${stamp}.ndjson`,
    lines: lines.length,
    truncated,
  };
}
