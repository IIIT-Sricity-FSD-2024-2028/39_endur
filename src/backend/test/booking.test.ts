// Booking. What these tests are about, one line each:
//   capacity holds under concurrency - N+1 phones on a capacity-N slot, exactly N succeed
//   the loser gets 409 and not 400, because the request was fine and simply lost a race
//   cancelling frees the place, and the remaining count says so immediately
//   a booker cancels with their own token and no account
//   the tier ladder is visible from outside - 402 below gold, 403 without the capability
//   a bad, unopened or closed token is ONE 404, so the route is not an existence oracle
//   the public payload names nobody who has booked
//   and nothing in the booking feature reads the responses table
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../db/client.js';
import { addStaff, app, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';

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

// A bookable with one slot of the given capacity, open, and its public token.
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
    // This level can create and update but not cancel: the seeded gap that makes cancel its own verb.
    coordinator = await addStaff(owner.orgId, {
      name: 'Coordinator',
      level: 2,
      unitName: 'Section A',
    });
  });

  // The test this feature exists for.
  // Four phones, one place, fired at the same moment rather than in sequence - a count-then-insert
  // passes a sequential test and double-books a live room. The row lock is what makes exactly one win.
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
    // 409 and not 400: telling the loser to fix their form sends them looking for a mistake that is not there.
    expect(refused).toHaveLength(2);
    expect(results.every((res) => res.status === 201 || res.status === 409)).toBe(true);

    // And the database agrees, which is the half a status code cannot prove.
    const rows = await prisma.booking.count({ where: { slotId, cancelledAt: null } });
    expect(rows).toBe(capacity);

    const after = await publicRead(token);
    expect(after.body.data.slots[0].remaining).toBe(0);
  });

  it('hides a time that has already started, and refuses to book it', async () => {
    const { id, token } = await openOne(owner, 3);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;
    await prisma.slot.update({
      where: { id: slotId },
      data: { startsAt: new Date(at(-1)), endsAt: new Date(at(1)) },
    });

    const listed = await publicRead(token);
    expect(listed.status).toBe(200);
    expect(listed.body.data.slots).toHaveLength(0);

    const late = await takeSlot(token, slotId, 'Latecomer');
    expect(late.status).toBe(404);
    expect(await prisma.booking.count({ where: { slot: { bookableId: id } } })).toBe(0);
  });

  // Changing the times while guests are booking. Either the change wins, and nobody holds a
  // booking on a slot that no longer exists, or a booking wins and the change is refused - and a
  // booker who loses is told the time has gone, never handed a 500.
  //
  // The dangerous window is narrow (a slot change takes ~20ms), so the change is started first and
  // the bookings follow at a spread of small delays. Before lockSlot reported a deleted row, about
  // one round in five handed the bookers a 500.
  it('never loses a booking to a slot change, and never 500s the booker who lost', async () => {
    for (const delay of [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 0, 6, 12, 18, 24]) {
      const { id, token } = await openOne(owner, 10);
      const slotId = (await publicRead(token)).body.data.slots[0].id as string;

      // `.then` sends it now; a supertest request does not leave until something awaits it.
      const change = withCsrf(owner, 'put', `/api/v1/bookables/${id}/slots`)
        .send({ slots: [{ startsAt: at(48), endsAt: at(49), capacity: 10 }] })
        .then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, delay));
      const bookings = await Promise.all(
        Array.from({ length: 4 }, (_unused, index) =>
          takeSlot(token, slotId, `Racer${index}`).then((res) => res)),
      );
      const changed = await change;

      expect([200, 409]).toContain(changed.status);
      expect(bookings.map((res) => res.status).filter((status) => status !== 201 && status !== 404))
        .toEqual([]);
      const made = bookings.filter((res) => res.status === 201).length;
      const live = await prisma.booking.count({
        where: { slot: { bookableId: id }, cancelledAt: null },
      });
      expect(live).toBe(made);
      if (changed.status === 200) expect(made).toBe(0);
      else expect(made).toBeGreaterThan(0);
    }
  }, 60_000);

  it('lists, renames and deletes a bookable, and keeps another organisation out of all three', async () => {
    const { id } = await openOne(owner, 2);
    const stranger = await setUpOrg('hotel');
    await subscribe(stranger.orgId, 'gold');

    const listed = await owner.agent.get('/api/v1/bookables');
    expect(listed.status).toBe(200);
    expect((listed.body.data as Array<{ id: string }>).some((row) => row.id === id)).toBe(true);
    const theirs = await stranger.agent.get('/api/v1/bookables');
    expect((theirs.body.data as Array<{ id: string }>).some((row) => row.id === id)).toBe(false);

    const renamed = await withCsrf(owner, 'patch', `/api/v1/bookables/${id}`).send({ name: 'Renamed room' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Renamed room');
    const hijack = await withCsrf(stranger, 'patch', `/api/v1/bookables/${id}`).send({ name: 'Hijacked' });
    expect(hijack.status).toBe(404);

    expect((await withCsrf(stranger, 'delete', `/api/v1/bookables/${id}`)).status).toBe(404);
    const gone = await withCsrf(owner, 'delete', `/api/v1/bookables/${id}`);
    expect(gone.status).toBe(204);
    expect(await prisma.bookable.count({ where: { id } })).toBe(0);
    expect(await prisma.slot.count({ where: { bookableId: id } })).toBe(0);
  });

  // The foreign key knows nothing about tenants, so the service has to check the subject is ours.
  it('refuses to link a bookable to another organisation’s subject', async () => {
    const { id } = await openOne(owner, 1);
    const stranger = await setUpOrg('hotel');
    const theirUnit = await unitIdByName(stranger.orgId, 'Section A');
    const theirs = await withCsrf(stranger, 'post', '/api/v1/subjects').send({ name: 'Their room', unitId: theirUnit });
    expect(theirs.status).toBe(201);

    const res = await withCsrf(owner, 'patch', `/api/v1/bookables/${id}`).send({ subjectId: theirs.body.data.id });
    expect(res.status).toBe(404);
    const row = await prisma.bookable.findUnique({ where: { id }, select: { subjectId: true } });
    expect(row?.subjectId).toBeNull();

    const ourUnit = await unitIdByName(owner.orgId, 'Section A');
    const ours = await withCsrf(owner, 'post', '/api/v1/subjects').send({ name: 'Our room', unitId: ourUnit });
    const linked = await withCsrf(owner, 'patch', `/api/v1/bookables/${id}`).send({ subjectId: ours.body.data.id });
    expect(linked.status).toBe(200);
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

    // Derived, not stored: the count changed because a row is cancelled, with no counter to decrement.
    expect((await publicRead(token)).body.data.slots[0].remaining).toBe(1);

    // And somebody else can have the place.
    const next = await takeSlot(token, slotId, 'Ravi');
    expect(next.status).toBe(201);
  });

  it('lets a booker cancel with their own token and no account', async () => {
    const { token } = await openOne(owner, 1);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;

    const taken = await takeSlot(token, slotId, 'Anon');
    const cancelToken = taken.body.data.cancelToken as string;
    expect(cancelToken).toHaveLength(8);

    // No session, no CSRF token, no capability: the token is the authorisation and reaches exactly one row.
    const cancelled = await request(app).post(`/api/v1/public/bookings/${cancelToken}/cancel`);
    expect(cancelled.status).toBe(204);
    expect((await publicRead(token)).body.data.slots[0].remaining).toBe(1);

    // Idempotent, because pressing it twice is what a booker on a slow phone actually does.
    const again = await request(app).post(`/api/v1/public/bookings/${cancelToken}/cancel`);
    expect(again.status).toBe(204);
  });

  // The public payload leaves out the NAMES, and the capacity with them: a link that told a stranger who
  // is coming on Tuesday would be a worse leak than anything else here.
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

    // Never opened, so there is no token to try - the closest probe is the console id, which must not work either.
    const draft = await withCsrf(owner, 'post', '/api/v1/bookables').send({ name: 'Not open' });
    const unopened = await publicRead(draft.body.data.id as string);
    expect(unopened.status).toBe(404);

    const { id, token } = await openOne(owner, 1);
    expect((await publicRead(token)).status).toBe(200);
    await withCsrf(owner, 'post', `/api/v1/bookables/${id}/close`).send();
    const closed = await publicRead(token);
    expect(closed.status).toBe(404);
    // The same sentence for all three, because a different message is an existence oracle.
    expect(closed.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses to open a bookable with no slots at all', async () => {
    const created = await withCsrf(owner, 'post', '/api/v1/bookables').send({ name: 'Empty' });
    const opened = await withCsrf(
      owner,
      'post',
      `/api/v1/bookables/${created.body.data.id}/open`,
    ).send();
    // 409: the request is fine, the row is not ready. A link to an empty page is worse than no link.
    expect(opened.status).toBe(409);
  });

  it('refuses to rewrite slots that people have already booked', async () => {
    const { id, token } = await openOne(owner, 1);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;
    await takeSlot(token, slotId, 'Booked');

    const replaced = await withCsrf(owner, 'put', `/api/v1/bookables/${id}/slots`).send({
      slots: [{ startsAt: at(48), endsAt: at(49), capacity: 1 }],
    });
    // The cascade would silently drop an appointment, and the person losing it is not in the room to notice.
    expect(replaced.status).toBe(409);
  });

  it('gives a role without booking.cancel a 403, on the route that verb exists for', async () => {
    const { id, token } = await openOne(owner, 1);
    const slotId = (await publicRead(token)).body.data.slots[0].id as string;
    await takeSlot(token, slotId, 'Guest');
    const bookingId = (await owner.agent.get(`/api/v1/bookables/${id}/bookings`)).body.data[0]
      .id as string;

    // The coordinator can add slots.
    const ownBookable = await withCsrf(coordinator, 'post', '/api/v1/bookables').send({
      name: 'Coordinator room',
    });
    expect(ownBookable.status).toBe(201);

    // And cannot take back somebody else's booking.
    const refused = await withCsrf(
      coordinator,
      'post',
      `/api/v1/bookings/${bookingId}/cancel`,
    ).send();
    expect(refused.status).toBe(403);
  });

  // The tier ladder from outside: 402 for an organisation on a lower plan, 403 for a role without the
  // capability - never the other way round, because the capability check runs first.
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

      // A guest holding a link did not choose the plan: the console goes away, the booking page does not.
      expect((await publicRead(token)).status).toBe(200);
      expect((await takeSlot(token, slotId, 'Downgraded')).status).toBe(201);
    } finally {
      await subscribe(owner.orgId, 'gold');
    }
  });
});

// The identified/anonymous split, asserted structurally rather than by review.
// The promise dies not by somebody deleting it but by a future query in this folder joining the two,
// so this greps the directory - blunt, and it survives somebody who never read the header comment.
describe('bookings and responses never meet — DEC-090', () => {
  it('has no query in features/booking/ that touches the responses table', () => {
    // Resolved from THIS file, never from the working directory: a rule that only holds when the suite is
    // launched from one place is not a rule.
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'features', 'booking');
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const source = readFileSync(join(dir, name), 'utf8');
      // Comments are where the rule is explained, so they are stripped before it is checked.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(code, `${name} must not read responses`).not.toMatch(/\bresponses?\b/i);
    }
  });
});
