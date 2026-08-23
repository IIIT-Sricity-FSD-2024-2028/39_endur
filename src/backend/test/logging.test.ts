// 18 — logs and error information on disk. T-063.
//
// The evaluation criterion is "logs and error information should be stored in files at
// regular intervals", so these tests are about the FILES: that they appear, that they
// rotate on both axes, that old ones go, that the split between app and error holds, and
// that a broken log directory cannot take the application down.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pino, multistream } from 'pino';
import { createRotatingStream, dateKey } from '../lib/logFile.js';
import { createLogStreams, loggerOptions } from '../lib/logger.js';

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'endur-logs-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const today = dateKey();

describe('rotating log file', () => {
  it('writes to <prefix>-<date>.log and creates the directory', () => {
    const nested = path.join(dir, 'deep', 'logs');
    const stream = createRotatingStream({
      dir: nested,
      prefix: 'app',
      maxBytes: 1024,
      retentionDays: 14,
    });
    stream.write('hello\n');
    stream.close();

    expect(fs.readFileSync(path.join(nested, `app-${today}.log`), 'utf8')).toBe('hello\n');
  });

  it('rotates within the day at maxBytes', () => {
    const stream = createRotatingStream({ dir, prefix: 'app', maxBytes: 16, retentionDays: 14 });
    stream.write('0123456789\n'); // 11 bytes
    stream.write('0123456789\n'); // would take it to 22 — new file
    stream.close();

    expect(read(`app-${today}.log`)).toBe('0123456789\n');
    expect(read(`app-${today}.1.log`)).toBe('0123456789\n');
  });

  it('appends to the day file rather than truncating it on restart', () => {
    const first = createRotatingStream({ dir, prefix: 'app', maxBytes: 1024, retentionDays: 14 });
    first.write('before restart\n');
    first.close();

    const second = createRotatingStream({ dir, prefix: 'app', maxBytes: 1024, retentionDays: 14 });
    second.write('after restart\n');
    second.close();

    expect(read(`app-${today}.log`)).toBe('before restart\nafter restart\n');
  });

  it('removes files older than the retention window and keeps the rest', () => {
    const old = `app-${dateKey(new Date(Date.now() - 20 * 86_400_000))}.log`;
    const recent = `app-${dateKey(new Date(Date.now() - 2 * 86_400_000))}.log`;
    const foreign = 'notes.txt';
    for (const name of [old, recent, foreign]) fs.writeFileSync(path.join(dir, name), 'x');

    // Retention runs at open, which is the cheapest honest moment for a daily scan.
    createRotatingStream({ dir, prefix: 'app', maxBytes: 1024, retentionDays: 14 }).close();

    expect(fs.existsSync(path.join(dir, old))).toBe(false);
    expect(fs.existsSync(path.join(dir, recent))).toBe(true);
    // A file that is not one of ours is not ours to delete.
    expect(fs.existsSync(path.join(dir, foreign))).toBe(true);
  });

  it('retains by the DATE IN THE NAME, not by mtime', () => {
    const old = `app-${dateKey(new Date(Date.now() - 20 * 86_400_000))}.log`;
    fs.writeFileSync(path.join(dir, old), 'x');
    fs.utimesSync(path.join(dir, old), new Date(), new Date()); // touched just now

    createRotatingStream({ dir, prefix: 'app', maxBytes: 1024, retentionDays: 14 }).close();
    expect(fs.existsSync(path.join(dir, old))).toBe(false);
  });

  it('fails OFF rather than throwing when the directory cannot be used', () => {
    // A file where the directory should be: mkdir fails, and so would every write.
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');

    const stream = createRotatingStream({
      dir: blocked,
      prefix: 'app',
      maxBytes: 1024,
      retentionDays: 14,
    });
    expect(() => stream.write('still serving\n')).not.toThrow();
    expect(stream.currentPath()).toBeNull();
  });
});

describe('the two streams', () => {
  /** The real wiring from logger.ts, pointed at a temp directory. */
  const build = () =>
    pino(
      loggerOptions,
      multistream(
        createLogStreams({
          dir,
          level: 'info',
          maxBytes: 1024 * 1024,
          retentionDays: 14,
          toFile: true,
          stdout: { write: () => {} },
        }),
        { dedupe: false },
      ),
    );

  it('sends info to app only, and warn and error to BOTH', () => {
    const log = build();
    log.info({ requestId: 'r1' }, 'request');
    log.warn({ requestId: 'r2' }, 'FORBIDDEN');
    log.error({ requestId: 'r3' }, 'INTERNAL');

    const app = read(`app-${today}.log`);
    const err = read(`error-${today}.log`);

    expect(app).toContain('"requestId":"r1"');
    expect(app).toContain('"requestId":"r2"');
    expect(app).toContain('"requestId":"r3"');

    // The point of a second file: no 200s in it.
    expect(err).not.toContain('"requestId":"r1"');
    expect(err).toContain('"requestId":"r2"');
    expect(err).toContain('"requestId":"r3"');
  });

  it('redacts credentials before they reach disk', () => {
    const log = build();
    log.info({ password: 'hunter2', passwordHash: '$argon2id$abc' }, 'login');

    const app = read(`app-${today}.log`);
    expect(app).not.toContain('hunter2');
    expect(app).not.toContain('argon2id');
    // `remove: true`, so the key is ABSENT rather than present-and-starred (18 §3).
    expect(app).not.toContain('password');
  });

  it('writes no files at all when file logging is off', () => {
    const streams = createLogStreams({
      dir,
      level: 'info',
      maxBytes: 1024,
      retentionDays: 14,
      toFile: false,
      stdout: { write: () => {} },
    });
    expect(streams).toHaveLength(1);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });
});
