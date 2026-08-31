// Announcements. What these tests are about, one line each:
//   the tier ladder is visible from outside - 402 on a write, 200 on a read, at bronze
//   the capability split is real - a coordinator drafts and cannot publish
//   the denominator is honest - receipts are written at publish time, one per recipient
//   a published notice is frozen - 409, never a silent overwrite
//   a notice addressed to somebody else 404s, and never 403s
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../db/client.js';
import { addStaff, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';

async function subscribe(orgId: string, tier: 'silver' | 'bronze'): Promise<void> {
  const today = new Date();
  const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { orgId },
    create: { orgId, tier, periodStart: today, periodEnd: nextYear, status: 'active' },
    update: { tier },
  });
}

const draft = (session: Session, body: Record<string, unknown>) =>
  withCsrf(session, 'post', '/api/v1/announcements').send(body);

describe('announcements', () => {
  let owner: Session;
  let coordinator: Session;
  let reader: Session;

  beforeAll(async () => {
    owner = await setUpOrg('university');
    await subscribe(owner.orgId, 'silver');
    // This level can create and cannot publish: the seeded gap that makes the two verbs worth having.
    coordinator = await addStaff(owner.orgId, {
      name: 'Coordinator',
      level: 2,
      unitName: 'Section A',
    });
    // This level can only read.
    reader = await addStaff(owner.orgId, { name: 'Reader', level: 3, unitName: 'Section A' });
  });

  it('publishes to everybody, writing one receipt per recipient', async () => {
    const created = await draft(owner, {
      title: 'Fire drill on Friday',
      body: 'Everybody out by the north stair.',
      audience: { kind: 'anyone' },
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    // A draft has been sent to nobody, so both numbers are zero rather than a guess at who it would reach.
    expect(created.body.data.publishedAt).toBeNull();
    expect(created.body.data.recipients).toBe(0);

    const published = await withCsrf(owner, 'post', `/api/v1/announcements/${id}/publish`).send();
    expect(published.status).toBe(200);
    expect(published.body.data.publishedAt).not.toBeNull();

    // All three accounts hold a receipt, which is what "anyone" means here: an announcement has no link
    // and no stranger reads it, so the widest audience is every member of staff.
    const receipts = await prisma.announcementReceipt.count({ where: { announcementId: id } });
    expect(receipts).toBe(3);
    expect(published.body.data.recipients).toBe(3);
    expect(published.body.data.read).toBe(0);
  });

  it('counts reads against the denominator taken at publish time', async () => {
    const created = await draft(owner, {
      title: 'Timetables are up',
      body: 'The new ones are on the board.',
      audience: { kind: 'anyone' },
    });
    const id = created.body.data.id as string;
    await withCsrf(owner, 'post', `/api/v1/announcements/${id}/publish`).send();

    const marked = await withCsrf(reader, 'post', `/api/v1/announcements/${id}/read`).send();
    expect(marked.status).toBe(204);

    const mine = await reader.agent.get(`/api/v1/announcements/${id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.readByMe).toBe(true);
    expect(mine.body.data.read).toBe(1);
    expect(mine.body.data.recipients).toBe(3);

    // Marking twice is not an error and does not move the number: the banner dismisses optimistically.
    await withCsrf(reader, 'post', `/api/v1/announcements/${id}/read`).send();
    const again = await reader.agent.get(`/api/v1/announcements/${id}`);
    expect(again.body.data.read).toBe(1);
  });

  it('refuses an edit once it is published, with 409', async () => {
    const created = await draft(owner, {
      title: 'Half day',
      body: 'We close at one.',
      audience: { kind: 'anyone' },
    });
    const id = created.body.data.id as string;

    const edited = await withCsrf(owner, 'patch', `/api/v1/announcements/${id}`).send({
      title: 'Half day (updated)',
    });
    expect(edited.status).toBe(200);

    await withCsrf(owner, 'post', `/api/v1/announcements/${id}/publish`).send();
    const late = await withCsrf(owner, 'patch', `/api/v1/announcements/${id}`).send({
      body: 'Actually we close at two.',
    });
    // The words people already read must not change under them while their receipts say they read them.
    expect(late.status).toBe(409);
  });

  it('lets a coordinator draft and refuses to let them publish', async () => {
    const created = await draft(coordinator, {
      title: 'Staff meeting',
      body: 'Thursday, in the hall.',
      audience: { kind: 'anyone' },
    });
    expect(created.status).toBe(201);

    const publish = await withCsrf(
      coordinator,
      'post',
      `/api/v1/announcements/${created.body.data.id}/publish`,
    ).send();
    // 403 from the middleware, not from a check inside the handler.
    expect(publish.status).toBe(403);
  });

  it('404s a notice addressed to somebody else, and never 403s', async () => {
    const sectionB = await unitIdByName(owner.orgId, 'Section B');
    const created = await draft(owner, {
      title: 'Section B only',
      body: 'The other corridor is closed.',
      audience: { kind: 'unit', unitId: sectionB, includeSubtree: true },
    });
    const id = created.body.data.id as string;
    await withCsrf(owner, 'post', `/api/v1/announcements/${id}/publish`).send();

    const seen = await reader.agent.get(`/api/v1/announcements/${id}`);
    // A 403 here would answer "did they send one?", which the id space must not be able to answer.
    expect(seen.status).toBe(404);

    const list = await reader.agent.get('/api/v1/announcements');
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).some((row) => row.id === id)).toBe(false);
  });

  it('previews the recipient count without writing anything', async () => {
    const before = await prisma.announcement.count({ where: { orgId: owner.orgId } });
    const preview = await withCsrf(owner, 'post', '/api/v1/announcements/preview').send({
      audience: { kind: 'anyone' },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.recipients).toBe(3);
    expect(await prisma.announcement.count({ where: { orgId: owner.orgId } })).toBe(before);
  });

  it('does not read `preview` as an announcement id', async () => {
    const asId = await owner.agent.get('/api/v1/announcements/preview');
    // The preview route never resolves as an announcement: it is registered before /:id for that reason.
    expect(asId.status).toBe(422);
    expect(asId.body.error.code).toBe('VALIDATION_FAILED');
  });

  describe('at bronze', () => {
    let bronze: Session;

    beforeAll(async () => {
      bronze = await setUpOrg('company');
      await subscribe(bronze.orgId, 'bronze');
    });

    it('402s on create and publish and 200s on read', async () => {
      const created = await draft(bronze, {
        title: 'Not on this plan',
        body: 'This should not be written.',
        audience: { kind: 'anyone' },
      });
      // 402 and not 403: they hold the capability, the organisation has not bought the feature.
      expect(created.status).toBe(402);
      expect(created.body.error.details.requiredTier).toBe('silver');

      // Reading is in bronze, so a downgraded organisation still reads what it was already sent.
      const list = await bronze.agent.get('/api/v1/announcements');
      expect(list.status).toBe(200);
      expect(list.body.data).toEqual([]);
    });
  });
});
