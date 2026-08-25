// Turns one raw line from `app-*.log` / `error-*.log` into a `LogLine`. 72 § Data contract.
//
// `requestLogger` and `errorFunnel` write pino JSON with a fixed set of fields
// (`requestId`, `method`, `path`, `status`, `durationMs`, `orgId`, `principal`, `err`) plus
// pino's own (`time`, `level`, `msg`, `pid`, `hostname`, `env`). EVERYTHING ELSE — a field
// nobody named here — lands in `extra`, because a field that was not expected to be on a
// log line is the one worth seeing, not hiding (72 § Data contract, 56 § Anonymity).
import type { LogLine } from '@endur/shared';
import { TAIL_FIELD, decodeValue, levelFromName, parseStamp } from '../../lib/logFormat.js';

const KNOWN_KEYS = new Set([
  'time', 'level', 'msg', 'pid', 'hostname', 'env',
  'requestId', 'method', 'path', 'status', 'durationMs', 'orgId', 'principal', 'err',
]);

/**
 * `72` § States — "an unparseable line is rendered raw and flagged, never skipped." The
 * `LogLine` contract has no separate "this line failed to parse" field, so the flag is
 * carried the same way an unexpected field is: through `extra`. `level: 0` is below every
 * real pino level (10=trace and up), so an unparsed line is visibly distinct without a
 * schema change.
 */
function unparsed(raw: string, fallbackDate: string): LogLine {
  return {
    at: `${fallbackDate}T00:00:00.000Z`,
    level: 0,
    msg: raw.length > 500 ? `${raw.slice(0, 500)}…` : raw,
    extra: { unparsed: true, raw },
  };
}

export function parseLogLine(raw: string, fallbackDate: string): LogLine {
  // Two formats, on purpose. Files written since the bracketed format landed look like
  // `[2026-08-25 …] [pid] [INFO] [HTTP] …`; files still inside the 14-day retention window
  // from before it are pino JSON. Dropping the JSON branch would have blanked a week of
  // history on /ops/logs the day the writer changed, which is not an acceptable way to
  // change a log format.
  if (raw.startsWith('[')) return parseTextLine(raw, fallbackDate);

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return unparsed(raw, fallbackDate);
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return unparsed(raw, fallbackDate);
  }
  const o = obj as Record<string, unknown>;

  const at = typeof o.time === 'number' ? new Date(o.time).toISOString()
    : typeof o.time === 'string' ? o.time
    : null;
  const level = typeof o.level === 'number' ? o.level : null;
  if (at === null || level === null) return unparsed(raw, fallbackDate);

  const line: LogLine = { at, level, msg: typeof o.msg === 'string' ? o.msg : '' };
  if (typeof o.requestId === 'string') line.requestId = o.requestId;
  if (typeof o.method === 'string') line.method = o.method;
  if (typeof o.path === 'string') line.path = o.path;
  if (typeof o.status === 'number') line.status = o.status;
  if (typeof o.durationMs === 'number') line.durationMs = o.durationMs;
  if (typeof o.orgId === 'string') line.orgId = o.orgId;
  if (typeof o.principal === 'string') line.principal = o.principal;

  if (o.err && typeof o.err === 'object' && !Array.isArray(o.err)) {
    const err = o.err as Record<string, unknown>;
    line.err = {
      type: typeof err.type === 'string' ? err.type : typeof err.name === 'string' ? err.name : 'Error',
      message: typeof err.message === 'string' ? err.message : JSON.stringify(err),
      ...(typeof err.stack === 'string' ? { stack: err.stack } : {}),
    };
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(o)) {
    if (!KNOWN_KEYS.has(key)) extra[key] = value;
  }
  if (Object.keys(extra).length > 0) line.extra = extra;

  return line;
}


/**
 * The bracketed on-disk format, read back. `lib/logFormat.ts` owns the grammar and the
 * encoding helpers — this file must never grow its own copy of either, for the same reason
 * the log reader borrows the writer's filename regex rather than restating it.
 */
function parseTextLine(raw: string, fallbackDate: string): LogLine {
  // `[-]` where the pid should be: a record that carried none (a converted older file), never
  // a guess at whose process it was.
  const head = /^\[([^\]]+)\] \[(\d+|-)\] \[([A-Z0-9]+)\] \[([^\]]*)\](.*)$/.exec(raw);
  if (!head?.[1] || !head[3]) return unparsed(raw, fallbackDate);

  const at = parseStamp(head[1]);
  const level = levelFromName(head[3]);
  if (at === null || level === null) return unparsed(raw, fallbackDate);

  const tag = head[4] ?? '';
  const body = (head[5] ?? '').trim();

  // A summary the writer had to quote is read FIRST, off the front, and the `key=value` tail
  // is whatever follows it. Peeling the tail first would reach inside the quotes and take a
  // `req=…` that was part of somebody's message — which is precisely the case the writer
  // quoted it to prevent.
  const quoted = body.startsWith('"') ? readQuoted(body) : null;
  let rest = quoted ? quoted.rest : body;

  // Otherwise the tail is peeled off the END, one field at a time, because that is the only
  // edge of the line whose position is known: the summary in front of it is free text.
  const fields = new Map<string, unknown>();
  for (;;) {
    const match = TAIL_FIELD.exec(rest);
    if (!match?.[1] || match[2] === undefined) break;
    fields.set(match[1], decodeValue(match[2]));
    rest = rest.slice(0, match.index);
  }

  const summary = quoted ? quoted.value : rest.trim();

  const str = (key: string): string | undefined => {
    const value = fields.get(key);
    if (typeof value === 'string') return value;
    // A bare `42` decodes as a number; an id or a code that happens to look numeric is still
    // the string it was written as. Anything else was never a scalar and is not a string.
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  };
  const num = (key: string): number | undefined => {
    const value = fields.get(key);
    return typeof value === 'number' ? value : undefined;
  };

  const isHttp = tag === 'HTTP';
  const line: LogLine = {
    at,
    level,
    // What the formatter dropped as implied, put back: a request line's `msg` is `request`,
    // an error line's is its code, and a plain line's is the summary itself.
    msg: str('msg') ?? (isHttp ? 'request' : tag !== 'APP' && tag !== '' ? tag : summary),
  };

  if (isHttp) {
    // `<METHOD> <PATH>[ <status>][ <ms>ms]` — the summary IS the structured fields here,
    // which is what keeps a request line short enough to read.
    const http = /^(\S+) (\S+)(?: (\d{3}))?(?: (\d+)ms)?$/.exec(summary);
    if (http?.[1] && http[2]) {
      line.method = http[1];
      line.path = http[2];
      if (http[3]) line.status = Number(http[3]);
      if (http[4]) line.durationMs = Number(http[4]);
    }
  }

  const requestId = str('req');
  if (requestId !== undefined) line.requestId = requestId;
  const orgId = str('org');
  if (orgId !== undefined) line.orgId = orgId;
  const principal = str('principal');
  if (principal !== undefined) line.principal = principal;
  const status = num('status');
  if (status !== undefined) line.status = status;
  const durationMs = num('dur');
  if (durationMs !== undefined) line.durationMs = durationMs;

  const errType = str('err');
  if (errType !== undefined) {
    const stack = str('stack');
    line.err = {
      type: errType,
      message: str('errmsg') ?? summary,
      ...(stack !== undefined ? { stack } : {}),
    };
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of fields) {
    if (key.startsWith('x.')) extra[key.slice(2)] = value;
  }
  if (Object.keys(extra).length > 0) line.extra = extra;

  return line;
}


/** Reads a leading JSON string off `body`, returning it and what follows. Hand-scanned
 *  rather than regexed: the scan has to respect backslash escapes to find the real closing
 *  quote, and a regex that does that correctly is less readable than the loop. */
function readQuoted(body: string): { value: string; rest: string } | null {
  for (let i = 1; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch !== '"') continue;
    try {
      const value: unknown = JSON.parse(body.slice(0, i + 1));
      if (typeof value !== 'string') return null;
      return { value, rest: body.slice(i + 1).trim() };
    } catch {
      return null;
    }
  }
  return null;
}
