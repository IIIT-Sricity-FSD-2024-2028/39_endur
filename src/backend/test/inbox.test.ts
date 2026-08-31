// The response inbox.
// The read/unread/archived mechanic is not the interesting half. The interesting half is that this is
// a list of individual comments ACROSS campaigns, which is the most tempting place in the product to
// build a second path around the anonymity gate.
// So the assertions that matter are the ones about what does NOT come back.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addStaff, app, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { config } from '../lib/config.js';
import { prisma } from '../db/client.js';

const stranger = () => request(app);

// A launched campaign in one unit, with a set number of responses, each carrying a comment.
async function campaignIn(
  founder: Session,
  opts: { unitName: string; subject: string; name: string; count: number },
) {
  const unitId = await unitIdByName(founder.orgId, opts.unitName);
  const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
    name: opts.subject,
    unitId,
  });
  const templates = await founder.agent.get('/api/v1/templates');
  const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;

  const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name: opts.name,
    templateId,
    subjectIds: [subject.body.data.id],
    audience: { kind: 'anyone' },
  });
  const campaignId = campaign.body.data.id as string;
  const launch = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});
  const token = launch.body.data.publicToken as string;

  const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;

  for (let i = 0; i < opts.count; i += 1) {
    const answers = questions.map((question) => {
      switch (question.kind) {
        case 'rating':
          return { questionId: question.id, value: { kind: 'rating', n: (i % 5) + 1 } };
        case 'nps':
          return { questionId: question.id, value: { kind: 'nps', n: 8 } };
        case 'yesno':
          return { questionId: question.id, value: { kind: 'yesno', yes: true } };
        case 'single':
          return {
            questionId: question.id,
            value: { kind: 'single', option: question.config.options?.[0] ?? '' },
          };
        case 'multi':
          return {
            questionId: question.id,
            value: { kind: 'multi', options: [question.config.options?.[0] ?? ''] },
          };
        default:
          return {
            questionId: question.id,
            value: { kind: 'text', text: `${opts.name} comment ${i + 1}` },
          };
      }
    });
    const res = await stranger().post(`/api/v1/public/campaigns/${token}/responses`).send({ answers });
    expect(res.status).toBe(201);
  }

  return { campaignId, subjectId: subject.body.data.id as string };
}

type Card = {
  id: string;
  questionId: string;
  comment: string;
  score: number | null;
  scoreMax: number | null;
  read: boolean;
  archived: boolean;
  campaign: { id: string; name: string };
  subject: { id: string; name: string } | null;
};

const list = (session: Session, qs = '') =>
  session.agent.get(`/api/v1/inbox${qs}`).then((res) => ({
    status: res.status,
    total: res.body.meta?.total as number,
    cards: (res.body.data ?? []) as Card[],
  }));

// The gate.

describe('the k-anonymity gate is the results service’s, and the inbox borrows it', () => {
  it('contributes NO ROWS from a campaign below the threshold — not a suppressed placeholder', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Quiet round',
      count: config.K_ANON_THRESHOLD - 1,
    });

    const below = await list(founder, '?state=all');
    expect(below.status).toBe(200);
    // Zero, not "3 hidden": no count, no greyed card, no hint that anything exists.
    expect(below.total).toBe(0);
    expect(below.cards).toEqual([]);
    expect(JSON.stringify(below.cards)).not.toMatch(/Quiet round comment/);
  });

  it('lets the same campaign through the moment it reaches the threshold', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Loud round',
      count: config.K_ANON_THRESHOLD,
    });

    const at = await list(founder, '?state=all');
    expect(at.total).toBe(config.K_ANON_THRESHOLD);
    expect(at.cards[0]?.comment).toMatch(/Loud round comment/);
  });

  it('does NOT let two below-threshold campaigns become readable by being listed together', async () => {
    const founder = await setUpOrg();
    const each = config.K_ANON_THRESHOLD - 1;
    await campaignIn(founder, { unitName: 'Section A', subject: 'A1', name: 'First half', count: each });
    await campaignIn(founder, { unitName: 'Section A', subject: 'A2', name: 'Second half', count: each });

    // Two campaigns of four is eight, comfortably over a threshold of five - a naive merge would return
    // all eight. The gate is applied PER CAMPAIGN, before anything is merged.
    expect(each * 2).toBeGreaterThanOrEqual(config.K_ANON_THRESHOLD);

    const both = await list(founder, '?state=all');
    expect(both.total).toBe(0);
    expect(both.cards).toEqual([]);
  });
});

// Scope.

describe('scope filtering is 40’s, for the same caller', () => {
  let founder: Session;
  let head: Session;
  let sectionA: { campaignId: string };
  let sectionB: { campaignId: string };

  beforeAll(async () => {
    founder = await setUpOrg();
    sectionA = await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Section A round',
      count: config.K_ANON_THRESHOLD,
    });
    sectionB = await campaignIn(founder, {
      unitName: 'Section B',
      subject: 'Operating Systems',
      name: 'Section B round',
      count: config.K_ANON_THRESHOLD,
    });
    // A Section Head anchored at Section A reaches that section and what is below it, never the next one.
    head = await addStaff(founder.orgId, { name: 'Head of A', level: 2, unitName: 'Section A' });
  });

  it('shows the founder both campaigns and the head of Section A only theirs', async () => {
    const all = await list(founder, '?state=all&limit=100');
    const names = new Set(all.cards.map((card) => card.campaign.name));
    expect(names).toEqual(new Set(['Section A round', 'Section B round']));

    const mine = await list(head, '?state=all&limit=100');
    expect(mine.status).toBe(200);
    expect(new Set(mine.cards.map((card) => card.campaign.name))).toEqual(
      new Set(['Section A round']),
    );
  });

  it('MATCHES the responses endpoint exactly — the acceptance criterion, asserted by comparing', async () => {
    // The inbox and the results page share one predicate, so this is a regression guard on anybody
    // re-implementing either.
    for (const [campaignId, reachable] of [
      [sectionA.campaignId, true],
      [sectionB.campaignId, false],
    ] as const) {
      const viaResults = await head.agent.get(`/api/v1/campaigns/${campaignId}/responses`);
      const viaInbox = await list(head, `?state=all&limit=100&campaignId=${campaignId}`);
      expect(viaResults.status === 200).toBe(reachable);
      expect(viaInbox.total > 0).toBe(reachable);
    }
  });

  it('filters by campaign and by subject', async () => {
    const byCampaign = await list(founder, `?state=all&limit=100&campaignId=${sectionA.campaignId}`);
    expect(new Set(byCampaign.cards.map((card) => card.campaign.id))).toEqual(
      new Set([sectionA.campaignId]),
    );

    const subjectId = byCampaign.cards[0]?.subject?.id as string;
    const bySubject = await list(founder, `?state=all&limit=100&subjectId=${subjectId}`);
    expect(bySubject.cards.every((card) => card.subject?.id === subjectId)).toBe(true);
    expect(bySubject.total).toBe(config.K_ANON_THRESHOLD);
  });
});

// Anonymity.

describe('a card carries no respondent attribute, because no column could supply one', () => {
  it('returns the comment, the question, the score and the date, and nothing about a person', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Anonymous round',
      count: config.K_ANON_THRESHOLD,
    });

    const { cards } = await list(founder, '?state=all');
    const card = cards[0] as Card & Record<string, unknown>;

    // An allowlist, not an absence check: a new field added to the response fails this test rather than
    // sliding past it.
    expect(new Set(Object.keys(card))).toEqual(
      new Set([
        'id',
        'questionId',
        'at',
        'campaign',
        'subject',
        'comment',
        'questionText',
        'score',
        'scoreMax',
        'read',
        'archived',
      ]),
    );
    expect(JSON.stringify(cards)).not.toMatch(/email|respondent|userId|ip\b/i);
  });

  it('carries the rating from the SAME response and its scale, never an average', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Scored round',
      count: config.K_ANON_THRESHOLD,
    });

    const { cards } = await list(founder, '?state=all&limit=100');
    // The helper writes whole-number scores, one per response, so an average would be a give-away.
    const scores = cards.map((card) => card.score).sort();
    expect(scores).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(cards.map((card) => card.scoreMax))).toEqual(new Set([5]));
  });
});

// The mechanic.

describe('read state belongs to the reader', () => {
  let founder: Session;
  let other: Session;
  let responseId: string;

  beforeAll(async () => {
    founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Triage round',
      count: config.K_ANON_THRESHOLD,
    });
    other = await addStaff(founder.orgId, { name: 'Dean', level: 2, unitName: 'Root' });
    const { cards } = await list(founder, '?state=all');
    responseId = cards[0]?.id as string;
  });

  it('defaults to UNREAD, not all — the queue is what is new since last time', async () => {
    const bare = await founder.agent.get('/api/v1/inbox');
    expect(bare.status).toBe(200);
    expect(bare.body.meta.total).toBe(config.K_ANON_THRESHOLD);

    await withCsrf(founder, 'post', `/api/v1/inbox/${responseId}/read`).send({});
    const after = await founder.agent.get('/api/v1/inbox');
    expect(after.body.meta.total).toBe(config.K_ANON_THRESHOLD - 1);
  });

  it('does not touch anybody else’s queue', async () => {
    // The founder marked one read above; this reader has read nothing, so their unread count is the full set.
    const theirs = await list(other);
    expect(theirs.total).toBe(config.K_ANON_THRESHOLD);
    expect(theirs.cards.every((card) => card.read === false)).toBe(true);
  });

  it('moves between the tabs and back', async () => {
    const read = await list(founder, '?state=read');
    expect(read.cards.map((card) => card.id)).toEqual([responseId]);

    await withCsrf(founder, 'post', `/api/v1/inbox/${responseId}/unread`).send({});
    expect((await list(founder, '?state=read')).total).toBe(0);
    expect((await list(founder, '?state=unread')).total).toBe(config.K_ANON_THRESHOLD);
  });

  it('archives out of every other tab, and unarchives back into read', async () => {
    await withCsrf(founder, 'post', `/api/v1/inbox/${responseId}/archive`).send({});

    const archived = await list(founder, '?state=archived');
    expect(archived.cards.map((card) => card.id)).toEqual([responseId]);
    expect(archived.cards[0]?.archived).toBe(true);

    // Gone from All as well: an archive click that left the card in All would be a click that did nothing.
    for (const state of ['all', 'unread', 'read'] as const) {
      const tab = await list(founder, `?state=${state}&limit=100`);
      expect(tab.cards.some((card) => card.id === responseId)).toBe(false);
    }

    await withCsrf(founder, 'post', `/api/v1/inbox/${responseId}/unarchive`).send({});
    expect((await list(founder, '?state=archived')).total).toBe(0);
    // Archiving marked it read, and unarchiving does not undo that: it WAS read.
    expect((await list(founder, '?state=read')).cards.map((c) => c.id)).toEqual([responseId]);
  });

  it('ARCHIVING DOES NOT MODIFY OR DELETE THE RESPONSE — 52 §6', async () => {
    const before = await prisma.response.findUniqueOrThrow({
      where: { id: responseId },
      select: { id: true, submittedAt: true, subjectId: true, campaignId: true },
    });
    const answers = await prisma.answer.count({ where: { responseId } });

    await withCsrf(founder, 'post', `/api/v1/inbox/${responseId}/archive`).send({});

    expect(
      await prisma.response.findUniqueOrThrow({
        where: { id: responseId },
        select: { id: true, submittedAt: true, subjectId: true, campaignId: true },
      }),
    ).toEqual(before);
    expect(await prisma.answer.count({ where: { responseId } })).toBe(answers);
    await withCsrf(founder, 'post', `/api/v1/inbox/${responseId}/unarchive`).send({});
  });

  it('holds no response content in its own table — inbox_state is ids and two timestamps', async () => {
    const row = await prisma.inboxState.findFirstOrThrow({
      where: { userId: founder.userId, responseId },
    });
    expect(new Set(Object.keys(row))).toEqual(
      new Set(['orgId', 'userId', 'responseId', 'readAt', 'archivedAt']),
    );
  });
});

// Marking is gated exactly like reading.

describe('the write routes are gated too, or they become an oracle', () => {
  it('404s marking a response in a campaign the caller cannot reach', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section B',
      subject: 'Operating Systems',
      name: 'Out of reach',
      count: config.K_ANON_THRESHOLD,
    });
    const { cards } = await list(founder, '?state=all');
    const responseId = cards[0]?.id as string;

    const head = await addStaff(founder.orgId, {
      name: 'Head of A',
      level: 2,
      unitName: 'Section A',
    });
    const res = await withCsrf(head, 'post', `/api/v1/inbox/${responseId}/read`).send({});
    expect(res.status).toBe(404);
    expect(await prisma.inboxState.count({ where: { userId: head.userId } })).toBe(0);
  });

  it('404s marking a response in a campaign below the threshold — the same answer, so the gate says nothing', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Too quiet',
      count: config.K_ANON_THRESHOLD - 1,
    });
    const response = await prisma.response.findFirstOrThrow({
      where: { campaign: { orgId: founder.orgId } },
      select: { id: true },
    });

    const res = await withCsrf(founder, 'post', `/api/v1/inbox/${response.id}/read`).send({});
    // A distinct message here would announce that suppressed data exists.
    expect(res.status).toBe(404);
  });

  it('refuses a stranger, and needs a session', async () => {
    const res = await stranger().get('/api/v1/inbox');
    expect([401, 403]).toContain(res.status);
  });
});

// Paging.

describe('paging is over the filtered state, not over the page', () => {
  it('returns a full page of unread even when earlier rows are read', async () => {
    const founder = await setUpOrg();
    await campaignIn(founder, {
      unitName: 'Section A',
      subject: 'Data Structures',
      name: 'Long round',
      count: 12,
    });

    const all = await list(founder, '?state=all&limit=100');
    expect(all.total).toBe(12);

    // Mark the four newest read: an implementation that pages first and filters afterwards would return
    // a page of two.
    for (const card of all.cards.slice(0, 4)) {
      await withCsrf(founder, 'post', `/api/v1/inbox/${card.id}/read`).send({});
    }

    const page = await founder.agent.get('/api/v1/inbox?state=unread&limit=6');
    expect(page.body.data).toHaveLength(6);
    expect(page.body.meta.total).toBe(8);
    expect(page.body.page.hasMore).toBe(true);

    const next = await founder.agent.get(
      `/api/v1/inbox?state=unread&limit=6&cursor=${encodeURIComponent(page.body.page.nextCursor)}`,
    );
    expect(next.body.data).toHaveLength(2);
    expect(next.body.page.hasMore).toBe(false);

    // No row appears on both pages.
    const ids = [...page.body.data, ...next.body.data].map((card: Card) => card.id);
    expect(new Set(ids).size).toBe(8);
  });
});
