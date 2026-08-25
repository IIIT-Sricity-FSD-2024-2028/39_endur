// 18 §2 — the bracketed on-disk log format, and the one property that makes it safe to
// adopt: it is REVERSIBLE. /ops/logs and the log export both read these files through
// `parseLogLine`, so a format the parser cannot turn back into the record that produced it
// is not a nicer log, it is a broken log viewer. Every test here is a round trip.
import { describe, expect, it } from 'vitest';
import { formatLogRecord, localStamp, parseStamp } from '../lib/logFormat.js';
import { parseLogLine } from '../platform/logs/parser.js';

const roundTrip = (record: Record<string, unknown>) => {
  const line = formatLogRecord(`${JSON.stringify({ time: Date.now(), pid: 4242, ...record })}\n`);
  expect(line.endsWith('\n')).toBe(true);
  // One record is one line, whatever a stack trace contains.
  expect(line.trimEnd().includes('\n')).toBe(false);
  return { line: line.trimEnd(), parsed: parseLogLine(line.trimEnd(), '2026-08-25') };
};

describe('the on-disk line', () => {
  it('reads as [when] [pid] [LEVEL] [TAG] summary', () => {
    const { line } = roundTrip({
      level: 30,
      requestId: 'r1',
      method: 'GET',
      path: '/healthz',
      status: 200,
      durationMs: 7,
      msg: 'request',
    });
    expect(line).toMatch(
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}\] \[4242\] \[INFO\] \[HTTP\] GET \/healthz 200 7ms req=r1$/,
    );
  });

  it('round-trips a request line', () => {
    const { parsed } = roundTrip({
      level: 30,
      requestId: 'r1',
      method: 'POST',
      path: '/api/v1/org/setup',
      status: 201,
      durationMs: 127,
      orgId: 'org-1',
      principal: 'user:u-1',
      msg: 'request',
    });
    expect(parsed).toMatchObject({
      level: 30,
      msg: 'request',
      method: 'POST',
      path: '/api/v1/org/setup',
      status: 201,
      durationMs: 127,
      requestId: 'r1',
      orgId: 'org-1',
      principal: 'user:u-1',
    });
  });

  it('round-trips an error line, stack and all, on one line', () => {
    const { line, parsed } = roundTrip({
      level: 40,
      requestId: 'r2',
      status: 409,
      code: 'CONFLICT',
      msg: 'CONFLICT',
      err: {
        type: 'ConflictError',
        message: 'Keep at least one role able to change powers.',
        stack: 'ConflictError: x\n    at assertSomebody (/a/service.ts:304:9)',
      },
    });
    // The tag is the code, so the eye finds it without reading the sentence.
    expect(line).toContain('[WARN] [CONFLICT]');
    expect(parsed.msg).toBe('CONFLICT');
    expect(parsed.status).toBe(409);
    expect(parsed.err).toEqual({
      type: 'ConflictError',
      message: 'Keep at least one role able to change powers.',
      stack: 'ConflictError: x\n    at assertSomebody (/a/service.ts:304:9)',
    });
    // A field nobody named still travels, and still looks unusual (72 § Data contract).
    expect(parsed.extra).toEqual({ code: 'CONFLICT' });
  });

  it('survives a message that ends in something shaped like a field', () => {
    const { parsed } = roundTrip({ level: 50, requestId: 'r3', msg: 'audit write failed req=abc' });
    expect(parsed.msg).toBe('audit write failed req=abc');
    expect(parsed.requestId).toBe('r3');
  });

  it('still reads the JSON files written before the format changed', () => {
    const parsed = parseLogLine(
      '{"level":30,"time":1787601898778,"requestId":"old","method":"GET","path":"/healthz","status":200,"msg":"request"}',
      '2026-08-23',
    );
    expect(parsed).toMatchObject({ requestId: 'old', path: '/healthz', status: 200 });
  });

  it('returns an unrecognisable record unchanged rather than losing it', () => {
    expect(formatLogRecord('not json at all\n')).toBe('not json at all\n');
    expect(formatLogRecord('{"msg":"no time or level"}\n')).toBe('{"msg":"no time or level"}\n');
  });

  it('flags a line it cannot parse instead of skipping it (72 § States)', () => {
    const parsed = parseLogLine('[nonsense] [x] [WHAT] [APP] hi', '2026-08-25');
    expect(parsed.level).toBe(0);
    expect(parsed.extra?.unparsed).toBe(true);
  });

  it('prints [-] rather than a guessed pid when the record carries none', () => {
    const line = formatLogRecord(
      `${JSON.stringify({ level: 30, time: Date.now(), msg: 'converted from an older file' })}\n`,
    ).trimEnd();
    expect(line).toContain('] [-] [INFO] [APP] ');
    expect(parseLogLine(line, '2026-08-25').msg).toBe('converted from an older file');
  });

  it('stamps local time with an offset that reads back to the same instant', () => {
    const at = Date.parse('2026-08-25T17:48:01.000Z');
    expect(parseStamp(localStamp(at))).toBe('2026-08-25T17:48:01.000Z');
  });
});
