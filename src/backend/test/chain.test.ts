// Tests for the middleware chain: every kind of error comes back in the same envelope,
// and no route can answer with a body outside it.
// They run against the real /auth/register route, which carries validation and needs no session.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

const REGISTER = '/api/v1/auth/register';

// Registration refuses a duplicate address, so each test that writes needs its own.
const freshEmail = (tag: string) =>
  `chain-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

// The organisation NAME has to be fresh too: the slug generator gives up after twenty variants,
// so a fixed name made the twenty-first run of the suite fail with an unrelated conflict.
// A test that depends on how many times it has been run before is not a test.
const freshOrgName = (tag: string) => `Chain ${tag} ${Date.now()}${Math.floor(Math.random() * 1e4)}`;

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
      orgName: freshOrgName('strip'),
      industry: 'custom',
      tier: 'bronze',
      // The forged field this rule exists for: if it were merged rather than stripped, the new
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
