// Turns one raw line from `app-*.log` / `error-*.log` into a `LogLine`. 72 § Data contract.
//
// `requestLogger` and `errorFunnel` write pino JSON with a fixed set of fields
// (`requestId`, `method`, `path`, `status`, `durationMs`, `orgId`, `principal`, `err`) plus
// pino's own (`time`, `level`, `msg`, `pid`, `hostname`, `env`). EVERYTHING ELSE — a field
// nobody named here — lands in `extra`, because a field that was not expected to be on a
// log line is the one worth seeing, not hiding (72 § Data contract, 56 § Anonymity).
import type { LogLine } from '@endur/shared';

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
