// T-021 — campaigns, and the decision that removed a whole failure mode. 13, 38, DEC-016.
//
// Status is derived on read, so the tests that matter are the ones that move the CLOCK
// rather than the ones that move a column: a campaign is open because the dates say so,
// and nothing has to run for that to be true.
import { beforeAll, describe, expect, it } from 'vitest';
import { setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { statusOf, whereStatus } from '../features/campaigns/status.js';

const HOUR = 60 * 60 * 1000;

/**
 * Tokens are globally unique, and this database is not reset between runs, so a literal
 * like 'OPEN2345' passes once and then collides forever. Minted per call instead.
 */
let tokenCounter = 0;
const someToken = () => {
  tokenCounter += 1;
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const seed = Date.now() * 100 + tokenCounter;
  let token = '';
  let n = seed;
  for (let i = 0; i < 8; i += 1) {
    token += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return token;
};

async function seedCampaignFixtures(founder: Session) {
  const sectionA = await unitIdByName(founder.orgId, 'Section A');
  const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
    name: 'Data Structures',
    unitId: sectionA,
  });
  const templates = await founder.agent.get('/api/v1/templates');
  const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;
  return { subjectId: subject.body.data.id as string, templateId, sectionA };
}

describe('status is derived from the dates, never stored — DEC-016', () => {
  const base = { publicToken: null, closedAt: null, startsAt: null, endsAt: null };
  const now = new Date('2026-08-19T12:00:00Z');

  it('reads draft when there is no token, whatever the dates say', () => {
    expect(statusOf({ ...base, startsAt: new Date('2026-01-01') }, now)).toBe('draft');
  });

  it('reads scheduled, open and closed straight off the window', () => {
    const launched = { ...base, publicToken: someToken() };
    expect(statusOf({ ...launched, startsAt: new Date(now.getTime() + HOUR) }, now)).toBe(
      'scheduled',
    );
    expect(statusOf(launched, now)).toBe('open');
    expect(statusOf({ ...launched, endsAt: new Date(now.getTime() - HOUR) }, now)).toBe('closed');
  });

  it('lets an explicit close win over a window that has not ended', () => {
    // Somebody pressing Close means it now. A scheduled end date still in the future must
    // not reopen the campaign behind them.
    expect(
      statusOf(
        {
          ...base,
          publicToken: someToken(),
          closedAt: now,
          endsAt: new Date(now.getTime() + 100 * HOUR),
        },
        now,
      ),
    ).toBe('closed');
  });

  it('the SQL filter agrees with the function, for every status', async () => {
    const founder = await setUpOrg();
    const { subjectId, templateId } = await seedCampaignFixtures(founder);

    const make = async (name: string, data: Record<string, unknown>) =>
      prisma.campaign.create({
        data: {
          orgId: founder.orgId,
          templateId,
          name,
          subjects: { create: [{ subjectId }] },
          ...data,
        },
        select: { id: true, publicToken: true, closedAt: true, startsAt: true, endsAt: true },
      });

    const rows = await Promise.all([
      make('a draft', {}),
      make('scheduled', { publicToken: someToken(), startsAt: new Date(Date.now() + HOUR) }),
      make('open', { publicToken: someToken() }),
      make('expired', { publicToken: someToken(), endsAt: new Date(Date.now() - HOUR) }),
      make('closed', { publicToken: someToken(), closedAt: new Date() }),
    ]);

    // whereStatus() restates the derivation in Prisma's vocabulary, which is the one
    // duplication this design costs. Comparing the two directly is what stops them
    // drifting apart quietly.
    for (const status of ['draft', 'scheduled', 'open', 'closed'] as const) {
      const matched = await prisma.campaign.findMany({
        where: { orgId: founder.orgId, ...whereStatus(status) },
        select: { id: true },
      });
      const expected = rows.filter((row) => statusOf(row) === status).map((row) => row.id);
      expect(matched.map((row) => row.id).sort()).toEqual(expected.sort());
    }
  });
});

describe('campaign lifecycle', () => {
  let founder: Session;
  let campaignId = '';
  let subjectId = '';
  let templateId = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    const fixtures = await seedCampaignFixtures(founder);
    subjectId = fixtures.subjectId;
    templateId = fixtures.templateId;
  });

  it('creates a draft with no token and no reachable URL', async () => {
    const res = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Autumn feedback',
      templateId,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    // A draft has no token and no `/r/` URL. Nothing to scan, nothing to leak (38).
    expect(res.body.data.publicToken).toBeNull();
    expect(res.body.data.url).toBeNull();
    campaignId = res.body.data.id as string;
  });

  it('launches with an 8-character token from the unambiguous alphabet — DEC-017', async () => {
    const res = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('open');
    // No 0, O, 1, I or L: this gets read aloud in a room during the demo.
    expect(res.body.data.publicToken).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    expect(res.body.data.url).toMatch(/\/r\/[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  });

  it('a second launch returns the SAME token, with or without an idempotency key', async () => {
    const first = await founder.agent.get(`/api/v1/campaigns/${campaignId}`);
    const again = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});

    // Idempotent by STATE, not only by key. A double-click on stage must not mint a second
    // token, because the QR already on the screen would then point at the wrong campaign.
    expect(again.body.data.publicToken).toBe(first.body.data.publicToken);
  });

  it('refuses edits once launched', async () => {
    const res = await withCsrf(founder, 'patch', `/api/v1/campaigns/${campaignId}`).send({
      name: 'Renamed mid-flight',
    });
    expect(res.status).toBe(409);
  });

  it('closes, and the close is what makes it closed', async () => {
    const res = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/close`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
    expect(res.body.data.closedAt).not.toBeNull();

    const again = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/close`).send({});
    expect(again.status).toBe(409);
  });

  it('a launch with a future start reads as scheduled, with nothing on a timer', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Next week',
      templateId,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
      startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    });
    const launched = await withCsrf(
      founder,
      'post',
      `/api/v1/campaigns/${created.body.data.id}/launch`,
    ).send({});

    // The token exists, so it has left draft; the clock says it has not started. No
    // scheduler ever has to notice — which is the whole of DEC-016.
    expect(launched.body.data.status).toBe('scheduled');
  });

  it('refuses a campaign on a template with no questions, and on a library template', async () => {
    const blank = await withCsrf(founder, 'post', '/api/v1/templates').send({
      name: 'Blank',
      category: 'Testing',
    });
    const empty = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Nothing to ask',
      templateId: blank.body.data.id,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
    });
    expect(empty.status).toBe(409);

    const library = await prisma.template.create({
      data: { orgId: null, name: 'Shared form', category: 'General' },
      select: { id: true },
    });
    const shared = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'On a library form',
      templateId: library.id,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
    });
    // A campaign pointing at a library template would hang every org's responses off the
    // same question rows. Clone first (36).
    expect(shared.status).toBe(409);
  });
});

describe('anonymity is immutable once a token is minted — INV-006', () => {
  it('is enforced by the database, not only by the service', async () => {
    const founder = await setUpOrg();
    const { subjectId, templateId } = await seedCampaignFixtures(founder);

    const created = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Promised anonymous',
      templateId,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
      anonymous: true,
    });
    const id = created.body.data.id as string;
    await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/launch`).send({});

    // Straight at the database, bypassing every service check. The trigger is the point:
    // respondents were promised anonymity at submission time, and the service layer is not
    // the only writer — seeds and imports write here too (10 §4.3).
    await expect(
      prisma.campaign.update({ where: { id }, data: { anonymous: false } }),
    ).rejects.toThrow(/immutable/i);
  });
});

describe('GET /campaigns/:id/audience', () => {
  it('resolves a unit rule against the org graph, subtree included', async () => {
    const founder = await setUpOrg();
    const { subjectId, templateId, sectionA } = await seedCampaignFixtures(founder);

    const created = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: 'Section A only',
      templateId,
      subjectIds: [subjectId],
      audience: { kind: 'unit', unitId: sectionA, includeSubtree: true },
    });

    const res = await founder.agent.get(`/api/v1/campaigns/${created.body.data.id}/audience`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.estimatedCount).toBe('number');
    expect(Array.isArray(res.body.data.sample)).toBe(true);
  });
});
