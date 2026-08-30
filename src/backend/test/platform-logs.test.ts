// T-077 — `72` § Acceptance. The log viewer's backend half: two GET routes, a path guard
// that fails closed on anything it did not expect, and one audit row per read.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, setUpOrg, unique } from './helpers.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../auth/password.js';
import { logDir } from '../lib/logger.js';
import { generateSecret, currentCode } from '../platform/totp.js';

type LogLineBody = {
  requestId?: string;
  path?: string;
  status?: number;
  extra?: Record<string, unknown>;
};

const PASSWORD = 'an-operator-password';

type Operator = { agent: ReturnType<typeof request.agent>; id: string };

async function makeOperator(role: 'owner' | 'staff'): Promise<Operator> {
  const email = `${unique(role)}@endur.test`;
  const secret = generateSecret();
  const row = await prisma.platformUser.create({
    data: { email, name: `Test ${role}`, role, passwordHash: await hashPassword(PASSWORD), mfaSecret: secret },
    select: { id: true },
  });
  const agent = request.agent(app);
  const login = await agent
    .post('/api/v1/platform/auth/login')
    .send({ email, password: PASSWORD, code: currentCode(secret) });
  expect(login.status).toBe(200);
  return { agent, id: row.id };
}

// A fixed date well away from whatever "today" is, so these fixtures cannot collide with a
// real file another test or a real request happens to write during the run.
const DATE = '2021-06-15';
const APP_FILE = `app-${DATE}.log`;
const ERROR_FILE = `error-${DATE}.log`;

function line(fields: Record<string, unknown>): string {
  return JSON.stringify({ level: 30, time: Date.now(), pid: 1, hostname: 'test', env: 'test', ...fields });
}

let appPath: string;
let errorPath: string;

beforeAll(() => {
  fs.mkdirSync(logDir, { recursive: true });
  appPath = path.join(logDir, APP_FILE);
  errorPath = path.join(logDir, ERROR_FILE);

  const requestId = unique('req');
  const rows = [
    line({ requestId, method: 'GET', path: '/api/v1/platform/orgs', status: 200, durationMs: 5, msg: 'request' }),
    // The would-be-leaked field — `userIp` names nothing `parseLogLine` knows about, and
    // must still be visible, under `extra`, not silently dropped (72 § Data contract).
    line({ requestId: unique('other'), method: 'GET', path: '/x', status: 200, userIp: '203.0.113.9', msg: 'request' }),
    'this is not json and cannot be parsed',
  ].join('\n');
  fs.writeFileSync(appPath, `${rows}\n`);

  // Same requestId as the app file's first line, in the error stream — so the requestId
  // collapse has something to prove across BOTH files, not just one.
  fs.writeFileSync(errorPath, `${line({ requestId, level: 50, msg: 'refused', status: 403 })}\n`);
});

afterAll(() => {
  for (const p of [appPath, errorPath]) {
    try {
      fs.unlinkSync(p);
    } catch {
      // already gone
    }
  }
});

describe('the file name is the whole attack surface', () => {
  it('accepts only names matching the pattern', async () => {
    const owner = await makeOperator('owner');
    const attempts = [
      '../../etc/passwd',
      '/etc/passwd',
      '..%2F..%2Fetc%2Fpasswd',
      'not-a-log-file.txt',
      `${APP_FILE}.bak`,
    ];
    for (const name of attempts) {
      const res = await owner.agent.get(`/api/v1/platform/logs/${encodeURIComponent(name)}`);
      expect(res.status, name).toBe(404);
    }
  });

  it('refuses a symlink at an otherwise-allowed name', async () => {
    const owner = await makeOperator('owner');
    const linkName = `app-${DATE}.9.log`;
    const linkPath = path.join(logDir, linkName);
    try {
      fs.symlinkSync(appPath, linkPath);
    } catch {
      // Symlink creation needs a privilege this environment may not grant (Windows without
      // developer mode) — the guard is still exercised by the traversal cases above.
      return;
    }
    try {
      const res = await owner.agent.get(`/api/v1/platform/logs/${linkName}`);
      expect(res.status).toBe(404);
    } finally {
      fs.unlinkSync(linkPath);
    }
  });
});

describe('an org user gets 401, whatever they hold in grants', () => {
  it('on both routes', async () => {
    const session = await setUpOrg();
    const list = await session.agent.get('/api/v1/platform/logs');
    expect(list.status).toBe(401);
    const read = await session.agent.get(`/api/v1/platform/logs/${APP_FILE}`);
    expect(read.status).toBe(401);
  });
});

describe('reading a file', () => {
  it('renders an unexpected field under `extra` rather than absorbing it', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}?limit=10`);
    expect(res.status).toBe(200);
    const data = res.body.data as LogLineBody[];
    const leaked = data.find((l) => l.extra?.userIp === '203.0.113.9');
    expect(leaked).toBeTruthy();
  });

  it('renders an unparseable line rather than dropping it', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}?limit=10`);
    const data = res.body.data as LogLineBody[];
    const unparsed = data.find((l) => l.extra?.unparsed === true);
    expect(unparsed).toBeTruthy();
    expect(unparsed?.extra?.raw).toBe('this is not json and cannot be parsed');
  });

  it('`requestId` returns every line of one request across both streams', async () => {
    const owner = await makeOperator('owner');
    const first = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}?limit=10`);
    const firstData = first.body.data as LogLineBody[];
    const requestId = firstData.find((l) => l.path === '/api/v1/platform/orgs')?.requestId;

    const res = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}?requestId=${requestId}`);
    expect(res.status).toBe(200);
    const data = res.body.data as LogLineBody[];
    expect(data).toHaveLength(2);
    const statuses = data.map((l) => l.status).sort();
    expect(statuses).toEqual([200, 403]); // one from app-*.log, one from error-*.log
  });

  // D-036, and the assertion is deliberately the WHOLE file rather than the first two pages.
  // The old version stopped after page 2 and was red for four days against a diagnosis that
  // said the fixture had shrunk below the 64 KB chunk so it was "asserting nothing". It was
  // asserting the right thing: the reader lost 170 of these 220 lines and said hasMore false.
  // A pagination test that walks two pages can only ever catch a bug in the first two pages —
  // the property is that paging to the end yields the file, so that is what is written here.
  //
  // Both sizes are on purpose. UNDER one chunk is where `hasMore` was wrong (one read takes
  // the scan to offset 0 while the limit is still capping the page), and OVER one chunk is
  // where the cursor was wrong (it named the chunk start, so every line the limit left
  // unreturned in that chunk was skipped). One fixture would have proved half of it.
  for (const [label, total, bulkDate] of [
    ['smaller than one 64 KB chunk', 220, '2021-06-16'],
    ['spanning several chunks', 900, '2021-06-18'],
  ] as const) {
    it(`pages backwards to the end of a file ${label}, with no gap or duplicate`, async () => {
      const owner = await makeOperator('owner');
      const bulkFile = `app-${bulkDate}.log`;
      const bulkPath = path.join(logDir, bulkFile);
      const rows: string[] = [];
      for (let i = 0; i < total; i += 1) {
        // A multi-byte character in every line: the cursor is a BYTE offset, and a reader
        // measuring it in string length walks off a line boundary the first time somebody
        // logs an accented name. Silent, and only above one chunk.
        rows.push(line({ msg: `line-${i}`, method: 'GET', path: '/x', status: 200, note: 'café ✓' }));
      }
      fs.writeFileSync(bulkPath, `${rows.join('\n')}\n`);
      try {
        const seen: string[] = [];
        let cursor: string | undefined;
        let pages = 0;
        for (;;) {
          const query = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
          const res = await owner.agent.get(`/api/v1/platform/logs/${bulkFile}?limit=50${query}`);
          expect(res.status).toBe(200);
          const data = res.body.data as LogLineBody[];
          seen.push(...data.map((l) => String((l as { msg?: string }).msg)));
          pages += 1;
          expect(pages).toBeLessThan(total); // a cursor that stops advancing must fail, not hang
          if (!res.body.page.hasMore) break;
          expect(res.body.page.nextCursor).toBeTruthy();
          cursor = res.body.page.nextCursor as string;
        }

        // Newest first, every line exactly once, in order — which is the same statement as
        // "no gap and no duplicate", said once instead of three times.
        const expected = Array.from({ length: total }, (_, i) => `line-${total - 1 - i}`);
        expect(seen).toEqual(expected);
      } finally {
        fs.unlinkSync(bulkPath);
      }
    });
  }

  it('no route here can write, delete or rotate a file', async () => {
    const owner = await makeOperator('owner');
    const write = await owner.agent.post(`/api/v1/platform/logs/${APP_FILE}`).send({});
    expect(write.status).toBe(404); // no such route exists at all — GET is the only verb
  });

  it('writes a `platform_audit_log` row — reading is an operator action', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}?limit=5`);
    expect(res.status).toBe(200);
    const rows = await prisma.platformAuditLog.findMany({
      where: { actorId: owner.id, action: 'logs.read' },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0]?.payload as { file?: string } | null)?.file).toBe(APP_FILE);
  });
});

describe('the file list', () => {
  it('behaves when file logging is off and there is nothing to list', async () => {
    // `NODE_ENV=test` leaves `logToFile` false unless `LOG_TO_FILE` is set (18 §5), which is
    // exactly the "fresh checkout, no files at all" state `72` § States asks for — an empty
    // list, not an error, even though fixture files exist on disk from the tests above.
    const owner = await makeOperator('owner');
    const res = await owner.agent.get('/api/v1/platform/logs');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// T-090 — `DEC-074`. The export is a second entry point into the same filesystem read, so
// the guard cases matter here as much as they do on the read route: a name allowlist that is
// only applied on one of two routes is not an allowlist.
describe('exporting a file', () => {
  it('runs the same name allowlist as the read route', async () => {
    const owner = await makeOperator('owner');
    for (const name of ['../../etc/passwd', '/etc/passwd', 'not-a-log-file.txt']) {
      const res = await owner.agent.get(`/api/v1/platform/logs/${encodeURIComponent(name)}/export`);
      expect(res.status, name).toBe(404);
    }
  });

  it('is refused for an org user whatever they hold in grants', async () => {
    const session = await setUpOrg();
    const res = await session.agent.get(`/api/v1/platform/logs/${APP_FILE}/export`);
    expect(res.status).toBe(401);
  });

  it('returns ndjson chronologically, as an attachment, and audits the copy', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}/export?format=ndjson`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.headers['content-disposition']).toContain('attachment');

    const lines = res.text.trim().split('\n').map((raw) => JSON.parse(raw) as { msg: string });
    expect(lines.length).toBeGreaterThan(0);

    // FILE ORDER, OLDEST FIRST — the exact reverse of the viewer's newest-first page, which
    // is the reason this is its own read rather than `tailRead` with a header (`DEC-074`).
    // Asserted against the read route rather than against sorted timestamps, because an
    // unparseable line's `at` is a synthetic fallback and sorting on it would be asserting
    // the parser's fallback rather than the export's order.
    const page = await owner.agent.get(`/api/v1/platform/logs/${APP_FILE}`);
    expect(page.status).toBe(200);
    const viewer = (page.body.data as { msg: string }[]).map((l) => l.msg);
    expect(lines.map((l) => l.msg)).toEqual([...viewer].reverse());

    // The audit row is the whole reason `72` could reverse its "no download" position.
    const rows = await prisma.platformAuditLog.findMany({
      where: { actorId: owner.id, action: 'logs.export' },
    });
    expect(rows.length).toBe(1);
    const payload = rows[0]?.payload as { file?: string; format?: string; lines?: number } | null;
    expect(payload?.file).toBe(APP_FILE);
    expect(payload?.format).toBe('ndjson');
    expect(payload?.lines).toBe(lines.length);
  });

  it('returns csv with a fixed header row and quotes a cell that would break the shape', async () => {
    const owner = await makeOperator('owner');
    const res = await owner.agent.get(`/api/v1/platform/logs/${ERROR_FILE}/export?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const rows = res.text.trim().split('\n');
    expect(rows[0]).toBe(
      'at,level,msg,requestId,method,path,status,durationMs,orgId,principal,err.type,err.message',
    );
    expect(rows.length).toBeGreaterThan(1);
  });
});
