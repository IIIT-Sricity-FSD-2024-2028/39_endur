// Ordering tests: deliberately mis-order two links in the chain and assert the failure is loud.
// This is what proves the ordering table is a requirement and not a comment - if one of these ever
// starts passing, the constraint it protects has quietly stopped being real.
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import {
  context, requestId, validate, errorFunnel, notFound, tenantResolver,
} from '../middleware/index.js';

const Dto = z.object({ body: z.object({ name: z.string().min(1) }) });

describe('chain ordering constraints', () => {
  it('errorFunnel registered BEFORE the route never sees that route\'s errors', async () => {
    const wrong = express();
    wrong.use(context, requestId);
    wrong.use(errorFunnel); // ← the classic Express mistake
    wrong.get('/boom', () => {
      throw new Error('kaboom');
    });

    const res = await request(wrong).get('/boom');
    // Express's own handler answers instead: HTML, and the leaked message.
    expect(res.headers['content-type']).not.toMatch(/json/);
    expect(res.body.error).toBeUndefined();
  });

  it('errorFunnel registered LAST produces the envelope', async () => {
    const right = express();
    right.use(context, requestId);
    right.get('/boom', () => {
      throw new Error('kaboom');
    });
    right.use(notFound);
    right.use(errorFunnel);

    const res = await request(right).get('/boom');
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.requestId).toBeTruthy();
    // Outside production the funnel does append the message deliberately, because it is the fastest way
    // to see what threw. The stack never crosses the boundary in any environment.
    expect(res.body.error.message).toContain('kaboom');
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|\.ts:\d+/);
  });

  it('bodyParser BEFORE validate: without it there is nothing to validate', async () => {
    const wrong = express();
    wrong.use(context, requestId);
    // no express.json() — req.body is undefined
    wrong.post('/x', validate(Dto), (_q, res) => res.json({ ok: true }));
    wrong.use(errorFunnel);

    const res = await request(wrong).post('/x').send({ name: 'Ada' });
    expect(res.status).toBe(422); // loud, not a silent pass
  });

  it('tenantResolver BEFORE the session is loaded cannot resolve an org — N-014', async () => {
    const wrong = express();
    wrong.use(context, requestId);
    // The console's own chain, mounted where the session has not been loaded yet: the ORDER is what
    // makes the tenant resolvable, not the link itself.
    wrong.use(tenantResolver({ required: true }));
    wrong.post('/api/v1/anything', (_q, res) => res.json({ ok: true }));
    wrong.use(errorFunnel);

    const res = await request(wrong).post('/api/v1/anything');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNRESOLVED_TENANT');
  });
});
