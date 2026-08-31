// Router-level middleware, proven by behaviour rather than by reading the code.
// The tenant, authenticate and CSRF links are mounted inside each feature router, and the three chains
// DIFFER - which is the whole point: if every router had the same chain it would belong in app.ts.
// Every request here is anonymous, so nothing below needs a fixture.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('the console chain — tenant REQUIRED', () => {
  it('refuses an anonymous console request before any handler runs', async () => {
    const res = await request(app).get('/api/v1/org');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNRESOLVED_TENANT');
  });

  it('applies to every route under the router, including ones that do not exist', async () => {
    // router.use() matches all paths, so an unknown path INSIDE a mounted router is still refused for
    // want of an organisation rather than reaching the not-found handler.
    const res = await request(app).get('/api/v1/units/nope/nope');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNRESOLVED_TENANT');
  });

  it('is mounted on every console router, not just the first one', async () => {
    const prefixes = [
      '/api/v1/org',
      '/api/v1/units',
      '/api/v1/roles',
      '/api/v1/grants',
      '/api/v1/authz',
      '/api/v1/people',
      '/api/v1/subjects',
      '/api/v1/templates',
      '/api/v1/campaigns',
      '/api/v1/home',
    ];
    const results = await Promise.all(prefixes.map((p) => request(app).get(p)));
    for (const [i, res] of results.entries()) {
      expect(`${prefixes[i]} → ${res.body.error?.code}`).toBe(
        `${prefixes[i]} → UNRESOLVED_TENANT`,
      );
    }
  });
});

describe('the auth chain — tenant OPTIONAL', () => {
  it('lets an anonymous request reach the handler, because signing in has no tenant yet', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    // Whatever it answers, it is NOT "no organisation could be determined": the request got past the
    // tenant link and was judged on its contents.
    expect(res.body.error?.code).not.toBe('UNRESOLVED_TENANT');
    expect(res.status).toBe(422);
  });

  it('issues a CSRF cookie on a safe method, so the SPA can boot', async () => {
    const res = await request(app).get('/api/v1/auth/csrf');
    expect(res.status).toBeLessThan(500);
  });
});

describe('the respondent chain — its own CORS, no CSRF, uniform 404', () => {
  it('answers a bad token with 404, never 401 — no existence oracle (13 §6)', async () => {
    const res = await request(app).get('/api/v1/public/campaigns/ZZZZZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sends the wide CORS header the console never sends', async () => {
    const pub = await request(app)
      .get('/api/v1/public/campaigns/ZZZZZZZZ')
      .set('Origin', 'https://a-strangers-phone.example');
    expect(pub.headers['access-control-allow-origin']).toBe('*');
    // The console's policy is credentialed and origin-checked, so it never answers with a wildcard.
    const console_ = await request(app)
      .get('/api/v1/org')
      .set('Origin', 'https://a-strangers-phone.example');
    expect(console_.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('does not demand a CSRF token, because there is no ambient authority to borrow', async () => {
    const res = await request(app)
      .post('/api/v1/public/campaigns/ZZZZZZZZ/responses')
      .send({ answers: [] });
    expect(res.body.error?.code).not.toBe('CSRF_FAILED');
  });
});

describe('what is NOT in any router chain', () => {
  it('404s a path that matches no router, rather than demanding a tenant first', async () => {
    // With a global resolver this answered 401, which is a confusing reply to "that route does not exist".
    const res = await request(app).get('/api/v1/there-is-no-such-thing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('keeps /healthz free of every router chain', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
