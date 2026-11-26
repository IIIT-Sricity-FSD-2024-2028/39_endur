// Forms waiting on a person's Home page, and the Inbox message that tells them so.
//
// Only members-only campaigns, only for the people their audience rule is about, only while
// open, and only until that person has answered. The answer itself stays exactly as anonymous
// as on the link (campaign-access.test.ts): Home submits through the same route.
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnsweredForm, AudienceRule, WaitingForm } from '@endur/shared';
import {
  addStaff, roleIdByLevel, setUpOrg, unitIdByName, withCsrf, type Session,
} from './helpers.js';

type Launched = { campaignId: string; token: string; name: string };

let founder: Session;
let templateId: string;
let subjectId: string;

async function launch(
  name: string,
  access: 'public' | 'organization',
  audience: AudienceRule,
  startsAt?: Date,
): Promise<Launched> {
  const campaign = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name,
    templateId,
    subjectIds: [subjectId],
    audience,
    access,
    ...(startsAt ? { startsAt: startsAt.toISOString() } : {}),
  });
  expect(campaign.status).toBe(201);
  const launched = await withCsrf(
    founder,
    'post',
    `/api/v1/campaigns/${campaign.body.data.id}/launch`,
  ).send({});
  expect(launched.status).toBe(200);
  return { campaignId: campaign.body.data.id as string, token: launched.body.data.publicToken as string, name };
}

const waitingFor = async (session: Session): Promise<string[]> => {
  const res = await session.agent.get('/api/v1/home/waiting');
  expect(res.status).toBe(200);
  return (res.body.data as WaitingForm[]).map((form) => form.name).sort();
};

const answeredBy = async (session: Session): Promise<AnsweredForm[]> => {
  const res = await session.agent.get('/api/v1/home/answered');
  expect(res.status).toBe(200);
  return res.body.data as AnsweredForm[];
};

const answer = async (session: Session, token: string) => {
  const sent = await withCsrf(session, 'post', `/api/v1/public/campaigns/${token}/responses`)
    .set('Idempotency-Key', `home-${token}-${Math.random()}`)
    .send({ answers: await answersFor(session, token), channel: 'home' });
  expect(sent.status).toBe(201);
};

const messagesFor = async (session: Session) => {
  const res = await session.agent.get('/api/v1/inbox/messages');
  expect(res.status).toBe(200);
  return res.body.data as Array<{ kind: string; subject: string; body: string }>;
};

/** One valid answer per question, whatever the template asks. */
const answersFor = async (session: Session, token: string) => {
  const form = await session.agent.get(`/api/v1/public/campaigns/${token}`);
  expect(form.status).toBe(200);
  const questions = form.body.data.questions as Array<{
    id: string;
    kind: string;
    config: { options?: string[] };
  }>;
  return questions.map((question) => {
    switch (question.kind) {
      case 'rating': return { questionId: question.id, value: { kind: 'rating', n: 4 } };
      case 'nps': return { questionId: question.id, value: { kind: 'nps', n: 9 } };
      case 'yesno': return { questionId: question.id, value: { kind: 'yesno', yes: true } };
      case 'single':
        return { questionId: question.id, value: { kind: 'single', option: question.config.options?.[0] ?? '' } };
      case 'multi':
        return { questionId: question.id, value: { kind: 'multi', options: [question.config.options?.[0] ?? ''] } };
      default: return { questionId: question.id, value: { kind: 'text', text: 'Fine' } };
    }
  });
};

describe('forms waiting on Home', () => {
  // Asha is a Learner in Section A, Ben a Learner in Team A1 (under Section A), Chen a Tutor
  // in Section B. The founder is the Principal and launches everything.
  let asha: Session;
  let ben: Session;
  let chen: Session;
  let outsider: Session;
  let everyone: Launched;
  let learners: Launched;
  let sectionA: Launched;
  let sectionAOnly: Launched;
  let later: Launched;
  let publicLink: Launched;

  beforeAll(async () => {
    founder = await setUpOrg();
    [asha, ben, chen, outsider] = await Promise.all([
      addStaff(founder.orgId, { name: 'Asha', level: 4, unitName: 'Section A' }),
      addStaff(founder.orgId, { name: 'Ben', level: 4, unitName: 'Team A1' }),
      addStaff(founder.orgId, { name: 'Chen', level: 3, unitName: 'Section B' }),
      setUpOrg(),
    ]);

    const templates = await founder.agent.get('/api/v1/templates');
    templateId = (templates.body.data as Array<{ id: string; name: string }>).find(
      (template) => template.name === 'Course feedback',
    )?.id as string;
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Algebra',
      unitId: await unitIdByName(founder.orgId, 'Section A'),
    });
    subjectId = subject.body.data.id as string;

    const sectionAId = await unitIdByName(founder.orgId, 'Section A');
    everyone = await launch('Everyone', 'organization', { kind: 'anyone' });
    learners = await launch('Learners', 'organization', {
      kind: 'role', roleId: await roleIdByLevel(founder.orgId, 4),
    });
    sectionA = await launch('Section A and below', 'organization', {
      kind: 'unit', unitId: sectionAId, includeSubtree: true,
    });
    sectionAOnly = await launch('Section A only', 'organization', {
      kind: 'unit', unitId: sectionAId, includeSubtree: false,
    });
    publicLink = await launch('Public link', 'public', { kind: 'anyone' });
    later = await launch('Next month', 'organization', { kind: 'anyone' },
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  });

  it('lists the open members-only forms whose audience includes the reader, and nothing else', async () => {
    // The audience rule decides: role, unit, unit-and-below, or anyone. A public link never
    // appears (it cannot know who answered), and neither does one that has not opened yet.
    expect(await waitingFor(asha)).toEqual(
      ['Everyone', 'Learners', 'Section A and below', 'Section A only'],
    );
    expect(await waitingFor(ben)).toEqual(['Everyone', 'Learners', 'Section A and below']);
    expect(await waitingFor(chen)).toEqual(['Everyone']);
    // The launcher is in "anyone" too, and is asked like everybody else.
    expect(await waitingFor(founder)).toEqual(['Everyone']);
    // Another organisation's member sees none of it.
    expect(await waitingFor(outsider)).toEqual([]);
  });

  it('carries what the card needs: the token, what it is about, and its size', async () => {
    const res = await asha.agent.get('/api/v1/home/waiting');
    const form = (res.body.data as WaitingForm[]).find((row) => row.name === 'Everyone');
    expect(form).toMatchObject({
      campaignId: everyone.campaignId,
      token: everyone.token,
      about: 'Algebra',
      endsAt: null,
    });
    expect(form?.questionCount).toBeGreaterThan(0);
  });

  it('a form leaves once the reader has answered it — from Home, through the same route', async () => {
    const answers = await answersFor(chen, everyone.token);
    const sent = await withCsrf(chen, 'post', `/api/v1/public/campaigns/${everyone.token}/responses`)
      .set('Idempotency-Key', `home-${Date.now()}`)
      .send({ answers, channel: 'home' });
    expect(sent.status).toBe(201);

    expect(await waitingFor(chen)).toEqual([]);
    // Only Chen's: everybody else's card is still there.
    expect(await waitingFor(ben)).toContain('Everyone');
  });

  it('a closed form leaves', async () => {
    const closed = await withCsrf(founder, 'post', `/api/v1/campaigns/${sectionAOnly.campaignId}/close`)
      .send({});
    expect(closed.status).toBe(200);
    expect(await waitingFor(asha)).not.toContain('Section A only');
  });

  it('launch sends an Inbox message to each person it is for, and not to the launcher', async () => {
    const forAsha = (await messagesFor(asha)).filter((message) => message.kind === 'feedback_request');
    expect(forAsha.map((message) => message.subject).sort()).toEqual([
      `Waiting for your answer: ${everyone.name}`,
      `Waiting for your answer: ${learners.name}`,
      `Waiting for your answer: ${later.name}`,
      `Waiting for your answer: ${sectionA.name}`,
      `Waiting for your answer: ${sectionAOnly.name}`,
    ]);
    // Not open yet, and the message says so rather than sending them to an empty card.
    const scheduled = forAsha.find((message) => message.subject.endsWith(later.name));
    expect(scheduled?.body).toMatch(/not open yet/i);
    const open = forAsha.find((message) => message.subject.endsWith(everyone.name));
    expect(open?.body).toMatch(/top of your Home page/i);
    expect(open?.body).toMatch(/never what you said/i);

    // Chen is in "anyone" only; the public link sent nobody anything.
    const forChen = (await messagesFor(chen)).map((message) => message.subject).sort();
    expect(forChen).toEqual([
      `Waiting for your answer: ${everyone.name}`,
      `Waiting for your answer: ${later.name}`,
    ]);
    expect(await messagesFor(founder)).toEqual([]);
  });

  describe('past feedback', () => {
    it('lists what the reader has answered, and nobody else’s', async () => {
      // Chen answered "Everyone" above; nobody else has answered anything yet.
      expect((await answeredBy(chen)).map((form) => form.name)).toEqual(['Everyone']);
      expect(await answeredBy(asha)).toEqual([]);
      expect(await answeredBy(outsider)).toEqual([]);
    });

    it('says THAT they answered and what it was about, never what they said, and not when', async () => {
      const [form] = await answeredBy(chen);
      expect(form).toEqual({
        campaignId: everyone.campaignId,
        name: 'Everyone',
        about: 'Algebra',
        status: 'open',
        closedAt: null,
        endsAt: null,
      });
    });

    it('keeps a form after it closes, and says when it closed', async () => {
      await answer(asha, learners.token);
      expect((await answeredBy(asha)).map((form) => [form.name, form.status])).toEqual([
        ['Learners', 'open'],
      ]);

      const closed = await withCsrf(founder, 'post', `/api/v1/campaigns/${learners.campaignId}/close`)
        .send({});
      expect(closed.status).toBe(200);
      const [form] = await answeredBy(asha);
      expect(form).toMatchObject({ name: 'Learners', status: 'closed', endsAt: null });
      expect(Date.parse(form?.closedAt ?? '')).toBeGreaterThan(Date.now() - 60_000);
    });

    it('a public link answered while signed in is not listed: it never records who answered', async () => {
      await answer(ben, publicLink.token);
      expect(await answeredBy(ben)).toEqual([]);
    });
  });
});

