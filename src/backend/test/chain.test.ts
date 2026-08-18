// Chain integration tests. 12 §7, 51 §4.
// Every error type produces the envelope; no route can produce a body outside it.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

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
    const res = await request(app).post('/api/v1/_echo').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields[0]).toMatchObject({ path: 'body.name' });
  });

  it('strips unknown keys rather than ignoring them — INV-010', async () => {
    const res = await request(app).post('/api/v1/_echo').send({ name: 'Ada', orgId: 'forged' });
    expect(res.body.data.body).toEqual({ name: 'Ada' });
  });

  it('malformed JSON and oversized bodies leave through the funnel', async () => {
    const bad = await request(app).post('/api/v1/_echo')
      .set('Content-Type', 'application/json').send('{oops');
    expect(bad.body.error.code).toBe('BAD_REQUEST');

    const big = await request(app).post('/api/v1/_echo')
      .set('Content-Type', 'application/json').send(`{"name":"${'x'.repeat(300_000)}"}`);
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
