// T-083 — the improve loop. 44 § Acceptance.
//
// Deliberately short. Four things here are load-bearing and the rest is arithmetic:
//
//   1. THE ORDERING CONSTRAINT. The gap is unreadable until the reviewee has written their
//      own assessment, and it is the API that refuses — 44 calls this the most defensible
//      novelty claim in the product after the permission engine.
//   2. 402 vs 403, and 403 first (DEC-011).
//   3. SELF MEANS SELF. There is no path to another person's reflection at any level.
//   4. FINALISED MEANS FINALISED, enforced by the trigger rather than the service — 44 is
//      explicit that a service test would be testing the wrong layer.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { addStaff, app, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { config } from '../lib/config.js';

const stranger = () => request(app);

type Cycle = { campaignId: string; subjectId: string; status: string };

/** A launched campaign with `n` responses, whose subject IS the given user. */
async function cycleFor(
  founder: Session,
  reviewee: Session,
  opts: { unitName: string; responses: number },
): Promise<{ campaignId: string; subjectId: string; questionIds: string[] }> {
  const unitId = await unitIdByName(founder.orgId, opts.unitName);
  const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
    name: `Reviewed thing ${Date.now()}`,
    unitId,
  });
  const subjectId = subject.body.data.id as string;
  // The link is what makes this person the reviewee. There is no API for it yet (`35` owns
  // subject editing), and inventing one to make a test pass would be the wrong direction.
  await prisma.subject.update({ where: { id: subjectId }, data: { linkedUserId: reviewee.userId } });

  const templates = await founder.agent.get('/api/v1/templates');
  const templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;

  const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name: `Cycle ${Date.now()}`,
    templateId,
    subjectIds: [subjectId],
    audience: { kind: 'anyone' },
  });
  const campaignId = campaign.body.data.id as string;
  const launch = await withCsrf(founder, 'post', `/api/v1/campaigns/${campaignId}/launch`).send({});
  const token = launch.body.data.publicToken as string;

  const form = await stranger().get(`/api/v1/public/campaigns/${token}`);
  const questions = form.body.data.questions as Array<{
    id: string; kind: string; config: { options?: string[] };
  }>;
  const answersFor = (rating: number) =>
    questions.map((question) => {
      switch (question.kind) {
        case 'rating': return { questionId: question.id, value: { kind: 'rating', n: rating } };
        case 'nps': return { questionId: question.id, value: { kind: 'nps', n: 8 } };
        case 'yesno': return { questionId: question.id, value: { kind: 'yesno', yes: true } };
        case 'single':
          return { questionId: question.id, value: { kind: 'single', option: question.config.options?.[0] ?? '' } };
        case 'multi':
          return { questionId: question.id, value: { kind: 'multi', options: [question.config.options?.[0] ?? ''] } };
        default: return { questionId: question.id, value: { kind: 'text', text: 'fine' } };
      }
    });

  for (let n = 0; n < opts.responses; n += 1) {
    const res = await stranger()
      .post(`/api/v1/public/campaigns/${token}/responses`)
      .send({ answers: answersFor(3), subjectId });
    expect(res.status).toBe(201);
  }

  return { campaignId, subjectId, questionIds: questions.map((question) => question.id) };
}

/** The reflection body, rating everything at `n` so the gap is arithmetic we can predict. */
const reflection = (subjectId: string, questionIds: string[], kinds: string[], n: number) => ({
  subjectId,
  answers: questionIds.map((id, index) => {
    const kind = kinds[index];
    if (kind === 'rating') return { questionId: id, value: { kind: 'rating', n } };
    if (kind === 'nps') return { questionId: id, value: { kind: 'nps', n: 8 } };
    if (kind === 'yesno') return { questionId: id, value: { kind: 'yesno', yes: true } };
    return { questionId: id, value: { kind: 'text', text: 'my own view' } };
  }),
});

describe('the improve loop', () => {
  let gold: Session;
  let reviewee: Session;
  let cycle: Awaited<ReturnType<typeof cycleFor>>;
  let kinds: string[];

  beforeAll(async () => {
    gold = await setUpOrg('university', 'gold');
    reviewee = await addStaff(gold.orgId, { name: 'Reviewed Person', level: 3, unitName: 'Section A' });
    cycle = await cycleFor(gold, reviewee, { unitName: 'Section A', responses: 8 });
    const questions = await prisma.question.findMany({
      where: { id: { in: cycle.questionIds } },
      orderBy: { position: 'asc' },
      select: { kind: true },
    });
    kinds = questions.map((question) => question.kind);
  });

  /* ------------------------------------------------------- the two gates */

  it('402s below Gold, and 403s without the capability — never confused', async () => {
    const bronze = await setUpOrg('university', 'bronze');
    const paid = await bronze.agent.get('/api/v1/reflect');
    // The founder holds `reflection.read` at `self`, so this can only be the tier. That is
    // the pair D-012 made impossible to demonstrate until T-088 wrote the row.
    expect(paid.status).toBe(402);
    expect(paid.body.error.details.requiredTier).toBe('gold');

    const lowest = await addStaff(gold.orgId, { name: 'Respondent Level', level: 4, unitName: 'Section A' });
    const denied = await lowest.agent.get('/api/v1/reflect');
    // L4 is the respondent-level role and holds no `reflection.read` at all (50 §1). A 403
    // here rather than a 402: their organisation HAS paid.
    expect(denied.status).toBe(403);
  });

  /* ----------------------------------------------- the ordering constraint */

  it('refuses the gap until the reflection exists — and it is the API that refuses', async () => {
    const before = await reviewee.agent.get(`/api/v1/reflect/${cycle.campaignId}/gap`);
    expect(before.status).toBe(404);

    const submitted = await withCsrf(reviewee, 'post', `/api/v1/reflect/${cycle.campaignId}`)
      .send(reflection(cycle.subjectId, cycle.questionIds, kinds, 5));
    expect(submitted.status).toBe(200);

    const after = await reviewee.agent.get(`/api/v1/reflect/${cycle.campaignId}/gap`);
    expect(after.status).toBe(200);
    expect(after.body.data.suppressed).toBe(false);
  });

  it('shows self against received on the campaign\'s own question set, and names no winner', async () => {
    const gap = await reviewee.agent.get(`/api/v1/reflect/${cycle.campaignId}/gap`);
    const rows = gap.body.data.rows as Array<{
      questionId: string; self: number | null; received: number | null; delta: number | null;
    }>;
    // Every question, not a parallel "reflection template" (INV-008).
    expect(rows.map((row) => row.questionId).sort()).toEqual([...cycle.questionIds].sort());

    const rating = rows.find((row) => row.self === 5 && row.received === 3);
    expect(rating?.delta).toBe(2);
    // A blind spot and under-confidence are different facts and neither is a grade
    // (44 § The gap view). The payload carries no valence, no label, no judgement.
    expect(Object.keys(rating ?? {})).not.toContain('valence');

    // Where one half has no number, the delta is null rather than a number about nothing.
    const text = rows.find((row) => row.received === null);
    expect(text?.delta).toBeNull();
  });

  it('is write-once: a second submission is refused', async () => {
    const again = await withCsrf(reviewee, 'post', `/api/v1/reflect/${cycle.campaignId}`)
      .send(reflection(cycle.subjectId, cycle.questionIds, kinds, 1));
    expect(again.status).toBe(409);
  });

  /* ------------------------------------------------------------ self is self */

  it('gives one reviewee no path to another reviewee\'s cycle', async () => {
    const peer = await addStaff(gold.orgId, { name: 'A Peer', level: 3, unitName: 'Section A' });
    // Same level, same unit, and a Gold organisation — everything except being the subject.
    const gap = await peer.agent.get(`/api/v1/reflect/${cycle.campaignId}/gap`);
    // 404, not 403: somebody who is not a reviewee in this cycle has no business learning
    // that it exists (13 §5).
    expect(gap.status).toBe(404);

    const cycles = await peer.agent.get('/api/v1/reflect');
    expect(cycles.status).toBe(200);
    expect(cycles.body.data).toEqual([]);
  });

  it('refuses a reflection submitted on somebody else\'s behalf', async () => {
    const other = await addStaff(gold.orgId, { name: 'Another', level: 3, unitName: 'Section A' });
    const res = await withCsrf(other, 'post', `/api/v1/reflect/${cycle.campaignId}`)
      .send(reflection(cycle.subjectId, cycle.questionIds, kinds, 5));
    expect(res.status).toBe(404);
  });

  /* ------------------------------------------------------- the k-anon gate */

  it('suppresses the gap below the threshold, with no rows at all', async () => {
    const thin = await addStaff(gold.orgId, { name: 'Thinly Reviewed', level: 3, unitName: 'Section B' });
    const small = await cycleFor(gold, thin, {
      unitName: 'Section B',
      responses: config.K_ANON_THRESHOLD - 1,
    });
    const smallKinds = (
      await prisma.question.findMany({
        where: { id: { in: small.questionIds } }, orderBy: { position: 'asc' }, select: { kind: true },
      })
    ).map((question) => question.kind);

    await withCsrf(thin, 'post', `/api/v1/reflect/${small.campaignId}`)
      .send(reflection(small.subjectId, small.questionIds, smallKinds, 4));

    const gap = await thin.agent.get(`/api/v1/reflect/${small.campaignId}/gap`);
    expect(gap.status).toBe(200);
    expect(gap.body.data.suppressed).toBe(true);
    // ABSENT, not zeroed. A reviewee with three responses reading an average is a reviewee
    // who can work out who said what (52 §2, INV-007).
    expect(gap.body.data.rows).toBeUndefined();
    // Their own reflection is still theirs to see — it is the OTHERS' answers being withheld.
    expect(gap.body.data.reflectedAt).toBeTruthy();
  });

  /* --------------------------------------------------------- the plan, and 44's trigger */

  it('takes a plan, finalises it once, and then the DATABASE refuses a change', async () => {
    const created = await withCsrf(reviewee, 'post', `/api/v1/reflect/${cycle.campaignId}/plan`)
      .send({ items: [{ text: 'Publish slides before each session', status: 'open' }] });
    expect(created.status).toBe(200);
    const planId = created.body.data.id as string;

    const finalised = await withCsrf(reviewee, 'post', `/api/v1/reflect/plans/${planId}/finalise`).send({});
    expect(finalised.status).toBe(200);

    const edit = await withCsrf(reviewee, 'post', `/api/v1/reflect/${cycle.campaignId}/plan`)
      .send({ items: [{ text: 'Something else entirely', status: 'open' }] });
    expect(edit.status).toBe(409);

    // THE ASSERTION 44 ASKS FOR BY NAME: "trigger test, not a service test". Going around
    // the service entirely — this is a direct write — and the database still refuses.
    await expect(
      prisma.actionPlan.update({ where: { id: planId }, data: { items: [] } }),
    ).rejects.toThrow(/finalised/i);
  });

  it('lets a supervisor hold a check-in on a plan inside their scope, and nobody else\'s', async () => {
    const plan = await prisma.actionPlan.findFirstOrThrow({
      where: { orgId: gold.orgId }, select: { id: true },
    });

    const held = await withCsrf(gold, 'post', '/api/v1/checkins')
      .send({ actionPlanId: plan.id, notes: 'Discussed. Agreed to revisit in March.' });
    expect(held.status).toBe(200);

    // A peer at the same level in a DIFFERENT unit holds `checkin.create` at `own_unit`,
    // which does not reach this plan. 404, so the plan is not confirmed to exist.
    const outsider = await addStaff(gold.orgId, { name: 'Elsewhere', level: 3, unitName: 'Section B' });
    const refused = await withCsrf(outsider, 'post', '/api/v1/checkins')
      .send({ actionPlanId: plan.id, notes: 'not mine to hold' });
    expect(refused.status).toBe(404);
  });

  it('lists the cycle with a status that follows the loop', async () => {
    const cycles = await reviewee.agent.get('/api/v1/reflect');
    expect(cycles.status).toBe(200);
    const mine = (cycles.body.data as Cycle[]).find((row) => row.campaignId === cycle.campaignId);
    expect(mine?.status).toBe('finalised');
  });
});
