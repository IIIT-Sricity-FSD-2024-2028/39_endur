// Login is limited per IP AND per email.
// Per-IP alone fails in both directions on a campus: behind one shared address ten normal sign-ins
// exhaust the bucket and the eleventh person is locked out mid-demo, while raising the ceiling lets a
// credential-stuffing run against a thousand addresses walk straight through.
// These tests share one in-memory bucket with the rest of the suite, so every email here is unique
// per run - reusing one would poison the next test for fifteen minutes.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, unique } from './helpers.js';

const LIMIT = 10;

const attempt = (email: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-but-long-enough' });

const exhaust = async (email: string) => {
  for (let i = 0; i < LIMIT; i += 1) {
    const res = await attempt(email);
    // Every one of these is an ordinary failed sign-in, not the limit yet.
    expect(res.status, `attempt ${i + 1}`).toBe(401);
  }
};

describe('POST /auth/login rate limit — 15 § Rate limiting', () => {
  it('allows ten attempts on one address and refuses the eleventh', async () => {
    const email = `${unique('locked')}@example.test`;
    await exhaust(email);

    const over = await attempt(email);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
  });

  it('does NOT lock out a second address from the same IP — the campus-NAT case', async () => {
    const victim = `${unique('noisy')}@example.test`;
    const bystander = `${unique('bystander')}@example.test`;

    await exhaust(victim);
    expect((await attempt(victim)).status).toBe(429);

    // Same IP, different account: per-IP only would answer 429 here, and the person it belongs to
    // would have no idea why.
    const other = await attempt(bystander);
    expect(other.status).toBe(401);
  });

  it('treats Alice@X and alice@x as ONE bucket — case is not a fresh set of guesses', async () => {
    const email = `${unique('Mixed')}@Example.test`;
    await exhaust(email.toLowerCase());

    const shouted = await attempt(email.toUpperCase());
    expect(shouted.status).toBe(429);
  });

  it('goes through the standard error envelope, not the limiter default (12 §4.16)', async () => {
    const email = `${unique('envelope')}@example.test`;
    await exhaust(email);

    const over = await attempt(email);
    expect(over.status).toBe(429);
    expect(over.body).toHaveProperty('error.requestId');
    expect(over.body).toHaveProperty('error.message');
    // Standard rate-limit headers, which is what the client reads to say "try again in N minutes".
    expect(over.headers['ratelimit']).toMatch(/reset=\d+/);
  });
});
