// The on-disk log format. 18 §2.
//
// stdout stays pino JSON — that is what a container platform, `jq`, or any real log pipeline
// reads. The FILES are written in a bracketed, human-first line instead, because the files
// have a different reader: a person opening `app-2026-08-25.log` during an incident, or an
// evaluator opening it to see that logging happens at all. A wall of `{"level":30,...}` is
// technically the same information and practically unreadable.
//
//   [2026-08-25 23:18:01 UTC+05:30] [12756] [INFO] [HTTP] GET /api/v1/roles 200 27ms req=… org=…
//   [2026-08-25 23:18:39 UTC+05:30] [12756] [WARN] [CONFLICT] That would leave no role … err=ConflictError
//
// The grammar, and the whole reason this is not just pretty-printing:
//
//   [<local time with UTC offset>] [<pid>] [<LEVEL>] [<TAG>] <summary> <key=value …>
//
// It is LOSSLESS AND REVERSIBLE. `platform/logs/parser.ts` reads it back into the same
// `LogLine` the JSON produced — /ops/logs filters and the log export read these files, so a
// format that merely *looked* nice would have quietly broken the viewer. Everything the
// summary does not already carry is emitted as a `key=value` tail, and every value that
// could contain a space, a quote or an `=` is JSON-quoted, which is also what keeps one
// record on exactly one line however many newlines a stack trace has.
//
// TAG is the one piece of judgement: `HTTP` for a request line (the summary then IS the
// method, path, status and duration), the error code for anything the funnel logged, and
// `APP` for a plain message. The tag is what a person's eye lands on when scanning.

/** pino's numeric levels. `levelName` is deliberately total: an unknown number keeps its
 *  digits rather than becoming a lie like `INFO`. */
const LEVEL_NAMES: ReadonlyArray<[number, string]> = [
  [10, 'TRACE'], [20, 'DEBUG'], [30, 'INFO'], [40, 'WARN'], [50, 'ERROR'], [60, 'FATAL'],
];

export function levelName(level: number): string {
  return LEVEL_NAMES.find(([n]) => n === level)?.[1] ?? `L${level}`;
}

export function levelFromName(name: string): number | null {
  const known = LEVEL_NAMES.find(([, n]) => n === name);
  if (known) return known[1] === name ? known[0] : null;
  const numeric = /^L(\d+)$/.exec(name);
  return numeric?.[1] ? Number(numeric[1]) : null;
}

/** `2026-08-25 23:18:01 UTC+05:30` — LOCAL time, with the offset spelled out. Local because
 *  the file is named by the local day already (`logFile.ts` § dateKey) and a reader comparing
 *  a log line to "when did that happen" is looking at the clock on their own wall; the offset
 *  because a local time without one is unusable the moment the file leaves the machine. */
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

/** The reverse of `localStamp`, back to the ISO instant `LogLine.at` carries. */
export function parseStamp(stamp: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC([+-]\d{2}:\d{2})$/.exec(stamp);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}${m[3]}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Quote anything whose boundaries would otherwise be guesswork. A bare token is nicer to
 *  read, so ids and codes stay bare; a message, a stack or an empty value gets quoted. */
export function encodeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value === '' || /[\s"=[\]]/.test(value) ? JSON.stringify(value) : value;
  }
  return JSON.stringify(value) ?? 'null';
}

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

/** Fields the formatter names itself. Everything else on the record is somebody's ad-hoc
 *  field and travels as `x.<key>=`, so it is still there and still visibly not-standard. */
const NAMED_KEYS = new Set([
  'time', 'level', 'msg', 'pid', 'hostname', 'env',
  'requestId', 'method', 'path', 'status', 'durationMs', 'orgId', 'principal', 'err',
]);

const isCode = (msg: string) => /^[A-Z][A-Z0-9_]*$/.test(msg);

/**
 * One pino JSON line in, one formatted line out (both newline-terminated). A record this
 * cannot make sense of is returned UNCHANGED rather than dropped or mangled — the parser
 * still reads JSON, so the worst case is one line that looks like the old format, never a
 * lost line. A logger that eats its own edge cases is worse than an ugly one.
 */
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

  // The summary is the human sentence. For a request it is the request; for an error it is
  // the error's own message, which is the thing you were looking for.
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

  // What the parser will believe `msg` was, given only the tag and the summary. When that
  // differs from the truth, the truth is written out explicitly rather than assumed.
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

  // `-` rather than `process.pid` when the record carries none: a line written by another
  // process, or converted from an older file, must not be stamped with this one's id.
  const pid = typeof o.pid === 'number' ? o.pid : '-';
  const head = `[${localStamp(o.time)}] [${pid}] [${levelName(o.level)}] [${tag}]`;
  // A summary that itself ends in something shaped like `key=value` would be eaten by the
  // tail parser, so it is quoted — the one case where the human line pays for the machine one.
  const body = TAIL_FIELD.test(summary) ? JSON.stringify(summary) : summary;
  return `${[head, body, ...fields].filter((part) => part !== '').join(' ')}\n`;
}

/** The tail grammar, shared with the parser so the writer can tell when it must quote. */
export const TAIL_FIELD =
  /(?:^|\s)(req|org|principal|status|dur|err|errmsg|stack|msg|x\.[A-Za-z_][\w-]*)=("(?:\\.|[^"\\])*"|\S*)$/;
