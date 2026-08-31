// The on-disk log format: one bracketed, human-readable line per record.
//   [<local time with offset>] [<pid>] [<LEVEL>] [<TAG>] <summary> <key=value ...>
// It is lossless - platform/logs/parser.ts reads it straight back - so the /ops/logs viewer keeps working.

// pino's numeric levels. An unknown number keeps its digits rather than being renamed to something false.
const LEVEL_NAMES: ReadonlyArray<[number, string]> = [
  [10, 'TRACE'], [20, 'DEBUG'], [30, 'INFO'], [40, 'WARN'], [50, 'ERROR'], [60, 'FATAL'],
];

// The name for a level number.
export function levelName(level: number): string {
  return LEVEL_NAMES.find(([n]) => n === level)?.[1] ?? `L${level}`;
}

// The level number for a name, or null when it is not one.
export function levelFromName(name: string): number | null {
  const known = LEVEL_NAMES.find(([, n]) => n === name);
  if (known) return known[1] === name ? known[0] : null;
  const numeric = /^L(\d+)$/.exec(name);
  return numeric?.[1] ? Number(numeric[1]) : null;
}

// Formats a moment as local time with the UTC offset, since the file is already named by the local day.
export function localStamp(ms: number): string {
  const at = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  const offsetMin = -at.getTimezoneOffset();
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${date} ${time} UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// The reverse of localStamp, back to an ISO instant.
export function parseStamp(stamp: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC([+-]\d{2}:\d{2})$/.exec(stamp);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}${m[3]}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// Quotes a value whose boundaries would otherwise be guesswork; plain ids and codes stay bare.
export function encodeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value === '' || /[\s"=[\]]/.test(value) ? JSON.stringify(value) : value;
  }
  return JSON.stringify(value) ?? 'null';
}

// Turns an encoded value back into a string, number, boolean or null.
export function decodeValue(raw: string): unknown {
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

// Fields this formatter names itself. Anything else on a record travels as x.<key>= so it stays visible.
const NAMED_KEYS = new Set([
  'time', 'level', 'msg', 'pid', 'hostname', 'env',
  'requestId', 'method', 'path', 'status', 'durationMs', 'orgId', 'principal', 'err',
]);

const isCode = (msg: string) => /^[A-Z][A-Z0-9_]*$/.test(msg);

// Turns one pino JSON line into one formatted line. A record it cannot parse is passed through unchanged.
export function formatLogRecord(chunk: string): string {
  const raw = chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return chunk;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return chunk;
  const o = obj as Record<string, unknown>;
  if (typeof o.time !== 'number' || typeof o.level !== 'number') return chunk;

  const msg = typeof o.msg === 'string' ? o.msg : '';
  const err = o.err && typeof o.err === 'object' && !Array.isArray(o.err)
    ? (o.err as Record<string, unknown>)
    : null;

  const isHttp = typeof o.method === 'string' && typeof o.path === 'string';
  const tag = isHttp ? 'HTTP' : isCode(msg) ? msg : 'APP';

  // The summary is the human sentence: the request for an HTTP line, the message for an error.
  let summary: string;
  if (isHttp) {
    const status = typeof o.status === 'number' ? ` ${o.status}` : '';
    const duration = typeof o.durationMs === 'number' ? ` ${o.durationMs}ms` : '';
    summary = `${String(o.method)} ${String(o.path)}${status}${duration}`;
  } else if (err && typeof err.message === 'string') {
    summary = err.message;
  } else {
    summary = tag === 'APP' ? msg : '';
  }

  // What the parser would assume msg was. When that differs from the truth, msg is written out.
  const impliedMsg = isHttp ? 'request' : tag !== 'APP' ? tag : summary;

  const fields: string[] = [];
  const put = (key: string, value: unknown) => {
    if (value === undefined) return;
    fields.push(`${key}=${encodeValue(value)}`);
  };

  if (typeof o.requestId === 'string') put('req', o.requestId);
  if (typeof o.orgId === 'string') put('org', o.orgId);
  if (typeof o.principal === 'string') put('principal', o.principal);
  if (!isHttp && typeof o.status === 'number') put('status', o.status);
  if (!isHttp && typeof o.durationMs === 'number') put('dur', o.durationMs);
  if (err) {
    const type = typeof err.type === 'string' ? err.type
      : typeof err.name === 'string' ? err.name : 'Error';
    put('err', type);
    if (typeof err.message !== 'string') put('errmsg', JSON.stringify(err));
    if (typeof err.stack === 'string') put('stack', err.stack);
  }
  if (msg !== impliedMsg) put('msg', msg);
  for (const [key, value] of Object.entries(o)) {
    if (NAMED_KEYS.has(key)) continue;
    if (/^[A-Za-z_][\w-]*$/.test(key)) put(`x.${key}`, value);
  }

  // A dash when the record carries no pid, so a line from another process is not stamped with ours.
  const pid = typeof o.pid === 'number' ? o.pid : '-';
  const head = `[${localStamp(o.time)}] [${pid}] [${levelName(o.level)}] [${tag}]`;
  // A summary that itself ends in something shaped like key=value is quoted, or the parser would eat it.
  const body = TAIL_FIELD.test(summary) ? JSON.stringify(summary) : summary;
  return `${[head, body, ...fields].filter((part) => part !== '').join(' ')}\n`;
}

// The tail grammar, shared with the parser so the writer knows when it must quote.
export const TAIL_FIELD =
  /(?:^|\s)(req|org|principal|status|dur|err|errmsg|stack|msg|x\.[A-Za-z_][\w-]*)=("(?:\\.|[^"\\])*"|\S*)$/;
