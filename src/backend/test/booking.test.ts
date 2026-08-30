// Booking — T-095. 13 § Booking, DEC-090.
//
// What these tests are actually about, in one line each:
//
//   · CAPACITY HOLDS UNDER CONCURRENCY — N+1 phones on a capacity-N slot, exactly N succeed
//   · the loser gets 409 and not 400 — a well-formed request that lost a race
//   · cancelling FREES the place, and the remaining count says so immediately
//   · a booker cancels with their own token and NO account
//   · the TIER LADDER is visible from outside — 402 below gold, 403 without the capability
//   · a bad, unopened or closed token is ONE 404, so the route is not an existence oracle
//   · the public payload names NOBODY who has booked
//   · DEC-090 holds structurally: nothing in features/booking/ reads `responses`
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../db/client.js';
import { addStaff, app, setUpOrg, withCsrf, type Session } from './helpers.js';

async function subscribe(orgId: string, tier: 'gold' | 'silver' | 'bronze'): Promise<void> {
  const today = new Date();
  const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { orgId },
    create: { orgId, tier, periodStart: today, periodEnd: nextYear, status: 'active' },
    update: { tier },
  });
}

const HOUR = 60 * 60 * 1000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

/** A bookable with one slot of the given capacity, open, and its public token. */
async function openOne(owner: Session, capacity: number): Promise<{ id: string; token: string }> {
  const created = await withCsrf(owner, 'post', '/api/v1/bookables').send({
    name: `Room ${Math.random().toString(36).slice(2, 8)}`,
  });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;

  const slots = await withCsrf(owner, 'put', `/api/v1/bookables/${id}/slots`).send({
    slots: [{ startsAt: at(24), endsAt: at(25), capacity }],
  });
  expect(slots.status).toBe(200);

  const opened = await withCsrf(owner, 'post', `/api/v1/bookables/${id}/open`).send();
  expect(opened.status).toBe(200);
  return { id, token: opened.body.data.publicToken as string };
}

const publicRead = (token: string) => request(app).get(`/api/v1/public/bookables/${token}`);

const takeSlot = (token: string, slotId: string, name: string) =>
  request(app)
    .post(`/api/v1/public/bookables/${token}/bookings`)
    .send({ slotId, name, email: `${name.toLowerCase()}@example.test` });

describe('booking', () => {
  let owner: Session;
  let coordinator: Session;

  beforeAll(async () => {
    owner = await setUpOrg('hotel');
    await subscribe(owner.orgId, 'gold');
    // Level 2 holds `booking.create` and `booking.update` and NOT `booking.cancel` — the
    // seeded gap that makes cancel worth being its own verb (50 §1).
    coordinator = await addStaff(owner.orgId, {
      name: 'Coordinator',
      level: 2,
      unitName: 'Section A',
    });
  });

  /**
   * THE TEST THIS FEATURE EXISTS FOR.
   *
   * Four phones, one place. Fired concurrently and not in sequence, because a
   * count-then-insert passes a sequential test and double-books a live room: both readers
   * see `capacity - 1` before either writes. The row lock in `book()` is what makes exactly
   * one of these win, and this assertion is the only thing that proves the lock is there.
   */
  it('lets exactly N of N+1 concurrent bookings through, and 409s the rest', async () => {
    const capacity = 2;
    const { token } = await openOne(owner, capacity);
    const listed = await publicRead(token);
    const slotId = listed.body.data.slots[0].id as string;

    const results = await Promise.all(
      Array.from({ length: capacity + 2 }, (_unused, index) =>
        takeSlot(token, slotId, `Guest${index}`),
      ),
    );

    const created = results.filter((res) => res.status === 201);
    const refused = results.filter((res) => res.status === 409);
    expect(created).toHaveLength(capacity);
    // 409 AND NOT 400. The request was well-formed and lost a race, and telling the loser to
    // fix their form sends them to look for a mistake that is not there.
    expect(refused).toHaveLength(2);
    expect(results.every((res) => res.status === 201 || res.status === 409)).toBe(true);

    // And the database agrees, which is the half a status code cannot prove.
    const rows = await prisma.booking.count({ where: { slotId, cancelledAt: null } });
    expect(rows).toBe(capacity);

    const after = await publicRead(token);
    expect(after.body.data.slots[0].remaining).toBe(0);
  });

  it('frees the place when a booking is cancelled, immediately', async () => {
    const { id, token } = await openOne(owner, 1);
    const listed = await publicRead(token);
    const slotId = listed.body.data.slots[0].id as string;

    const taken = await takeSlot(token, slotId, 'Priya');
    expect(taken.status).toBe(201);
    expect((await publicRead(token)).body.data.slots[0].remaining).toBe(0);

    const bookings = await owner.agent.get(`/api/v1/bookables/${id}/bookings`);
    expect(bookings.status).toBe(200);
    const bookingId = bookings.body.data[0].id as string;

    const cancelled = await withCsrf(owner, 'post', `/api/v1/bookings/${bookingId}/cancel`).send();
    expect(cancelled.status).toBe(204);

    // Derived, not stored: the count changed because a row is now cancelled, and no counter
    // had to be decremented anywhere for it to be right.
    expect((await publicRead(token)).body.data.slots[0].remaining).toBe(1);

    // And somebody else can have it.
    const next = await takeSlot(token, slotId, 'Ravi');
    expect(next.status).toBe(201);
  });

  it('lets a booker cancel with their own token and no account', async () => {
    const { token } = await openOne(owner, 1);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;

    const taken = await takeSlot(token, slotId, 'Anon');
    const cancelToken = taken.body.data.cancelToken as string;
    expect(cancelToken).toHaveLength(8);

    // No session, no CSRF token, no capability. The token is the authorisation, and it
    // reaches exactly the one row it was minted for.
    const cancelled = await request(app).post(`/api/v1/public/bookings/${cancelToken}/cancel`);
    expect(cancelled.status).toBe(204);
    expect((await publicRead(token)).body.data.slots[0].remaining).toBe(1);

    // Idempotent: pressing it twice is what a booker on a slow phone actually does.
    const again = await request(app).post(`/api/v1/public/bookings/${cancelToken}/cancel`);
    expect(again.status).toBe(204);
  });

  /**
   * 13 §6, and the omission that matters is the NAMES. A link that tells a stranger who is
   * coming to the clinic on Tuesday is a worse leak than anything the campaign payload could
   * make, and `capacity` is withheld with it: remaining is what a booker needs.
   */
  it('tells a stranger how many places are left and nothing about who took the rest', async () => {
    const { token } = await openOne(owner, 3);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;
    await takeSlot(token, slotId, 'Meera');

    const payload = (await publicRead(token)).body.data;
    expect(Object.keys(payload).sort()).toEqual(['description', 'name', 'orgName', 'slots']);
    expect(Object.keys(payload.slots[0]).sort()).toEqual(['endsAt', 'id', 'remaining', 'startsAt']);
    expect(payload.slots[0].remaining).toBe(2);
    expect(JSON.stringify(payload)).not.toContain('Meera');
  });

  it('answers one 404 for a bad, unopened or closed token', async () => {
    const unknown = await publicRead('ZZZZZZZZ');
    expect(unknown.status).toBe(404);

    // Never opened — no token to try, so the closest probe is the console id, which must not
    // work as a public token either.
    const draft = await withCsrf(owner, 'post', '/api/v1/bookables').send({ name: 'Not open' });
    const unopened = await publicRead(draft.body.data.id as string);
    expect(unopened.status).toBe(404);

    const { id, token } = await openOne(owner, 1);
    expect((await publicRead(token)).status).toBe(200);
    await withCsrf(owner, 'post', `/api/v1/bookables/${id}/close`).send();
    const closed = await publicRead(token);
    expect(closed.status).toBe(404);
    // The same sentence for all three. A different message is an existence oracle.
    expect(closed.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses to open a bookable with no slots at all', async () => {
    const created = await withCsrf(owner, 'post', '/api/v1/bookables').send({ name: 'Empty' });
    const opened = await withCsrf(
      owner,
      'post',
      `/api/v1/bookables/${created.body.data.id}/open`,
    ).send();
    // 409: the request is fine, the row is not ready. A link to an empty page is worse than
    // no link, because a scanner cannot tell it from a broken product.
    expect(opened.status).toBe(409);
  });

  it('refuses to rewrite slots that people have already booked', async () => {
    const { id, token } = await openOne(owner, 1);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;
    await takeSlot(token, slotId, 'Booked');

    const replaced = await withCsrf(owner, 'put', `/api/v1/bookables/${id}/slots`).send({
      slots: [{ startsAt: at(48), endsAt: at(49), capacity: 1 }],
    });
    // The cascade would silently drop an appointment, and the person losing it is not in the
    // room to notice.
    expect(replaced.status).toBe(409);
  });

  it('gives a role without booking.cancel a 403, on the route that verb exists for', async () => {
    const { id, token } = await openOne(owner, 1);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;
    await takeSlot(token, slotId, 'Guest');
    const bookingId = (await owner.agent.get(`/api/v1/bookables/${id}/bookings`)).body.data[0]
      .id as string;

    // The coordinator can add slots — they hold `booking.update`.
    const ownBookable = await withCsrf(coordinator, 'post', '/api/v1/bookables').send({
      name: 'Coordinator room',
    });
    expect(ownBookable.status).toBe(201);

    // And cannot take back somebody else's decision.
    const refused = await withCsrf(
      coordinator,
      'post',
      `/api/v1/bookings/${bookingId}/cancel`,
    ).send();
    expect(refused.status).toBe(403);
  });

  /**
   * THE TIER LADDER, FROM THE OUTSIDE. 402 is what a silver organisation gets, and 403 is
   * what a role without the capability gets — never the other way round, because the chain
   * runs `requireCapability` before `requireEntitlement` (app.ts links 10-11).
   */
  it('402s a silver organisation and keeps the public link answering', async () => {
    const { token } = await openOne(owner, 2);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;

    await subscribe(owner.orgId, 'silver');
    try {
      const listed = await owner.agent.get('/api/v1/bookables');
      expect(listed.status).toBe(402);
      expect(listed.body.error.details?.requiredTier).toBe('gold');

      const created = await withCsrf(owner, 'post', '/api/v1/bookables').send({ name: 'Nope' });
      expect(created.status).toBe(402);

      // 16 §6: a guest holding a link did not choose the plan and is not punished for it.
      // The console goes away; the booking page does not.
      expect((await publicRead(token)).status).toBe(200);
      expect((await takeSlot(token, slotId, 'Downgraded')).status).toBe(201);
    } finally {
      await subscribe(owner.orgId, 'gold');
    }
  });
});

/**
 * DEC-090, ASSERTED STRUCTURALLY RATHER THAN BY REVIEW.
 *
 * A booking is identified and a response is anonymous forever (INV-006), and the way that
 * promise dies is not by somebody deleting it — it is by a future query in this directory
 * joining the two. A grep is a blunt instrument and it is the right one here: it survives
 * somebody who never read the header comment, which review does not.
 */
describe('bookings and responses never meet — DEC-090', () => {
  it('has no query in features/booking/ that touches the responses table', () => {
    // Resolved from THIS FILE, never from `process.cwd()` — D-037's lesson, and this guard
    // was still making the mistake. Run from `src/backend` the old path was right; run from
    // the repo root, which D-037 made the correct command, `readdirSync` threw and the guard
    // reported on nothing. A rule that only holds from one working directory is not a rule,
    // and a structural guard is the last place that should depend on how it was launched.
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'features', 'booking');
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const source = readFileSync(join(dir, name), 'utf8');
      // Comments are where the rule is EXPLAINED, so they are stripped before it is checked
      // — otherwise the explanation would fail the test it exists to justify.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(code, `${name} must not read responses`).not.toMatch(/\bresponses?\b/i);
    }
  });
});
