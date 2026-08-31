// Turns one raw line from a log file back into a LogLine object.
// Known fields are named; anything unexpected lands in 'extra', because an unexpected field is the one worth seeing.
import type { LogLine } from '@endur/shared';
import { TAIL_FIELD, decodeValue, levelFromName, parseStamp } from '../../lib/logFormat.js';

const KNOWN_KEYS = new Set([
  'time', 'level', 'msg', 'pid', 'hostname', 'env',
  'requestId', 'method', 'path', 'status', 'durationMs', 'orgId', 'principal', 'err',
]);

// An unparseable line is shown raw and flagged with level 0, never skipped.
function unparsed(raw: string, fallbackDate: string): LogLine {
  return {
    at: `${fallbackDate}T00:00:00.000Z`,
    level: 0,
    msg: raw.length > 500 ? `${raw.slice(0, 500)}…` : raw,
    extra: { unparsed: true, raw },
  };
}

export function parseLogLine(raw: string, fallbackDate: string): LogLine {
  // Two formats on purpose: the bracketed format written now, and pino JSON from files still inside retention.
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


// Reads the bracketed on-disk format back. The grammar lives in lib/logFormat.ts and is never copied here.
function parseTextLine(raw: string, fallbackDate: string): LogLine {
  // A dash where the pid should be means the record carried none; never guess one.
  const head = /^\[([^\]]+)\] \[(\d+|-)\] \[([A-Z0-9]+)\] \[([^\]]*)\](.*)$/.exec(raw);
  if (!head?.[1] || !head[3]) return unparsed(raw, fallbackDate);

  const at = parseStamp(head[1]);
  const level = levelFromName(head[3]);
  if (at === null || level === null) return unparsed(raw, fallbackDate);

  const tag = head[4] ?? '';
  const body = (head[5] ?? '').trim();

  // A quoted summary is read first, off the front, so a key=value inside somebody's message is not taken for a field.
  const quoted = body.startsWith('"') ? readQuoted(body) : null;
  let rest = quoted ? quoted.rest : body;

  // Otherwise fields are peeled off the END, one at a time, because the free-text summary has no fixed length.
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
    // A bare 42 becomes a number; anything quoted stays the string it was written as.
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
    // Puts back the msg the writer left out as implied: 'request' for an HTTP line, the code for an error.
    msg: str('msg') ?? (isHttp ? 'request' : tag !== 'APP' && tag !== '' ? tag : summary),
  };

  if (isHttp) {
    // For a request line the summary IS the fields: method, path, status and duration.
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


// Reads a leading JSON string off the text, scanned by hand so backslash escapes are respected.
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
