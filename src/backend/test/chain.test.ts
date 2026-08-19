// Chain integration tests. 12 §7, 51 §4.
// Every error type produces the envelope; no route can produce a body outside it.
//
// These used to run against a temporary `/api/v1/_echo` probe. It was deleted when the
// first real router mounted (T-015), so they run against `/api/v1/auth/register` instead —
// the one real route that carries `validate()` and needs no session, which makes it the
// honest place to prove the pipe. The unknown-key test got stronger in the move: instead
// of reading a stripped key back out of an echo, it now asserts that a forged `orgId`
// produced an organisation with a different id (INV-010).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

const REGISTER = '/api/v1/auth/register';

/** Registration refuses a duplicate address, so each test that writes needs its own. */
const freshEmail = (tag: string) =>
  `chain-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

describe('the error envelope', () => {
  it('X-Request-Id round-trips and appears in the envelope', async () => {
    const res = await request(app).get('/nope').set('X-Request-Id', 'trace-abc');
    expect(res.headers['x-request-id']).toBe('trace-abc');
    expect(res.body.error.requestId).toBe('trace-abc');
  });

  it('mints a request id when the inbound one is malformed', async () => {
    const res = await request(app).get('/nope').set('X-Request-Id', 'bad id spaces');
    expect(res.headers['x-request-id']).not.toBe('bad id spaces');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('an unmatched route is a 404 envelope, never Express HTML', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('a validation failure is 422 with a renderable field path', async () => {
    const res = await request(app).post(REGISTER).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const fields = res.body.error.details.fields as Array<{ path: string }>;
    expect(fields.map((field) => field.path)).toContain('body.email');
  });

  it('strips unknown keys rather than ignoring them — INV-010', async () => {
    const res = await request(app).post(REGISTER).send({
      email: freshEmail('strip'),
      password: 'a-long-enough-password',
      name: 'Ada',
      orgName: 'Strip Test Org',
      industry: 'custom',
      // The forgery INV-010 exists for. If it were merged rather than stripped, the new
      // organisation would carry an id somebody else chose.
      orgId: '00000000-0000-0000-0000-0000000000ff',
    });
    expect(res.status).toBe(201);
    expect(res.body.organization.id).not.toBe('00000000-0000-0000-0000-0000000000ff');
    expect(res.body.organization.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('malformed JSON and oversized bodies leave through the funnel', async () => {
    const bad = await request(app)
      .post(REGISTER)
      .set('Content-Type', 'application/json')
      .send('{oops');
    expect(bad.body.error.code).toBe('BAD_REQUEST');

    const big = await request(app)
      .post(REGISTER)
      .set('Content-Type', 'application/json')
      .send(`{"name":"${'x'.repeat(300_000)}"}`);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('an API route with no resolvable tenant is 401, not 404 — INV-010 runs first', async () => {
    const res = await request(app).get('/api/v1/units');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNRESOLVED_TENANT');
  });

  it('never leaks a stack trace', async () => {
    const res = await request(app).get('/nope');
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|\.ts:\d+/);
  });

  it('unknown origins get no CORS grant', async () => {
    const res = await request(app).get('/healthz').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
