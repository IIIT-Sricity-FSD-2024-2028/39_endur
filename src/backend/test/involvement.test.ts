// A campaign, read from the person's side — N-079.
//
// Four properties here are load-bearing and the rest is bookkeeping:
//   1. a RESPONDENT gets a list. They hold no account and no grants (DEC-009), so every other
//      block on their page is empty by construction, and this is the only one that can say
//      anything about them at all. It is the case the feature exists for;
//   2. the matcher agrees with `countAudience`. This file matches audience rules in memory
//      while `40`'s denominator matches them in SQL, and two screens disagreeing about who is
//      in one campaign is exactly the drift the pair-test in `status.ts` exists to prevent;
//   3. reading somebody ELSE's list is bounded by the caller's own `campaign.read` scope,
//      and reading your OWN is not bounded at all — `campaign.read` is administrative, so
//      gating it there would hide the list from everybody it is for;
//   4. nothing here says whether they ANSWERED, and nothing can. INV-006.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PersonCampaign } from '@endur/shared';
import { addStaff, setUpOrg, roleIdByLevel, unitIdByName, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { countAudience } from '../features/campaigns/audience.js';

let founder: Session;
/** A person with NO account: the respondent this whole feature is for. */
let learner: { id: string };
let learnerRoleId: string;
let sectionA: string;
let teamA1: string;

type Made = { id: string; name: string };

async function subjectIn(unitId: string, name: string): Promise<string> {
  const res = await withCsrf(founder, 'post', '/api/v1/subjects').send({ name, unitId });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function templateId(): Promise<string> {
  const templates = await founder.agent.get('/api/v1/templates');
  return (templates.body.data as Array<{ id: string; name: string }>).find(
    (template) => template.name === 'Course feedback',
  )?.id as string;
}

async function campaign(opts: {
  name: string;
  subjectId: string;
  audience: unknown;
  access?: 'public' | 'organization';
  launch?: boolean;
  close?: boolean;
}): Promise<Made> {
  const created = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
    name: opts.name,
    templateId: await templateId(),
    subjectIds: [opts.subjectId],
    audience: opts.audience,
    ...(opts.access ? { access: opts.access } : {}),
  });
  expect(created.status).toBe(201);
  const id = created.body.data.id as string;
  if (opts.launch !== false) {
    expect((await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/launch`).send({})).status).toBe(200);
  }
  if (opts.close) {
    expect((await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/close`).send({})).status).toBe(200);
  }
  return { id, name: opts.name };
}

/** The involvement list on one person, as read by one caller. */
async function involvementOf(session: Session, personId: string): Promise<PersonCampaign[]> {
  const res = await session.agent.get(`/api/v1/people/${personId}`);
  expect(res.status).toBe(200);
  return res.body.data.involvement as PersonCampaign[];
}

const names = (rows: PersonCampaign[]): string[] => rows.map((row) => row.name);

let roleRound: Made;
let unitRound: Made;
let openToAll: Made;
let membersOnly: Made;
let otherRole: Made;
let roleRoundInB: Made;
let notLaunched: Made;
let finished: Made;
let aboutThem: Made;

beforeAll(async () => {
  founder = await setUpOrg();
  sectionA = await unitIdByName(founder.orgId, 'Section A');
  teamA1 = await unitIdByName(founder.orgId, 'Team A1');
  learnerRoleId = await roleIdByLevel(founder.orgId, 4);
  const tutorRoleId = await roleIdByLevel(founder.orgId, 3);

  // A respondent: a person node, a position, and deliberately NO users row. This is what
  // `POST /people/:id` cannot make and the CSV import can, and it is 30 of the 45 people in
  // seed/iiit.ts. They sit in Team A1, one level BELOW Section A, so a subtree rule has to
  // walk to reach them.
  const person = await prisma.node.create({
    data: { orgId: founder.orgId, kind: 'person', name: 'Priya Nair' },
    select: { id: true },
  });
  const position = await prisma.node.create({
    data: {
      orgId: founder.orgId, kind: 'position', name: 'Learner @ Team A1',
      roleId: learnerRoleId, unitId: teamA1,
    },
    select: { id: true },
  });
  await prisma.edge.create({
    data: { orgId: founder.orgId, type: 'member', parentId: person.id, childId: position.id, isPrimary: true },
  });
  learner = person;

  const inA = await subjectIn(sectionA, 'Module in Section A');
  const inB = await subjectIn(await unitIdByName(founder.orgId, 'Section B'), 'Module in Section B');

  roleRound = await campaign({ name: 'Round by role', subjectId: inA, audience: { kind: 'role', roleId: learnerRoleId } });
  // The SAME audience rule, hung off a subject in the other half of the tree. A role rule
  // reaches this learner wherever the campaign's subject sits, which is what makes it the
  // clean test of the reader's own scope: same person, same rule, different unit.
  roleRoundInB = await campaign({
    name: 'Round by role, over in Section B',
    subjectId: inB,
    audience: { kind: 'role', roleId: learnerRoleId },
  });
  unitRound = await campaign({
    name: 'Round by unit',
    subjectId: inA,
    audience: { kind: 'unit', unitId: sectionA, includeSubtree: true },
  });
  openToAll = await campaign({ name: 'Round for anyone', subjectId: inA, audience: { kind: 'anyone' } });
  membersOnly = await campaign({
    name: 'Round for members', subjectId: inA, audience: { kind: 'anyone' }, access: 'organization',
  });
  otherRole = await campaign({ name: 'Round for tutors', subjectId: inA, audience: { kind: 'role', roleId: tutorRoleId } });
  notLaunched = await campaign({ name: 'Round still in draft', subjectId: inA, audience: { kind: 'anyone' }, launch: false });
  finished = await campaign({ name: 'Round already over', subjectId: inA, audience: { kind: 'anyone' }, close: true });

  // The other direction of travel: a campaign collecting ABOUT somebody, which is a subject
  // linked to their account (the reviewee of 44). There is no API for the link — improve.test.ts
  // makes the same point — so it is written directly.
  const reviewed = await subjectIn(sectionA, 'Founder — self review');
  await prisma.subject.update({ where: { id: reviewed }, data: { linkedUserId: founder.userId } });
  aboutThem = await campaign({
    name: 'Round about the founder', subjectId: reviewed, audience: { kind: 'role', roleId: tutorRoleId },
  });
});

describe('a respondent, who has nothing else on their page', () => {
  it('is on the list of every round that names their role', async () => {
    const rows = await involvementOf(founder, learner.id);
    const row = rows.find((entry) => entry.id === roleRound.id);
    expect(row).toBeDefined();
    expect(row?.reason).toBe('audience');
    // The ROLE alone. "Learner — Team A1" would say the round was a Team A1 round, and the
    // person reading the row has no other way to tell that it is not.
    expect(row?.via).toBe('Learner');
    expect(row?.status).toBe('open');
  });

  it('is reached by a subtree rule one level above them', async () => {
    const rows = await involvementOf(founder, learner.id);
    const row = rows.find((entry) => entry.id === unitRound.id);
    expect(row?.reason).toBe('audience');
    // A unit rule IS about the place, so here the place is the honest answer.
    expect(row?.via).toBe('Learner — Team A1');
  });

  it('sees a round open to anyone, with no position claimed for it', async () => {
    const rows = await involvementOf(founder, learner.id);
    const row = rows.find((entry) => entry.id === openToAll.id);
    expect(row?.reason).toBe('everyone');
    expect(row?.via).toBeNull();
  });

  it('is NOT shown a members-only round, because they cannot sign in to answer it', async () => {
    expect(names(await involvementOf(founder, learner.id))).not.toContain(membersOnly.name);
  });

  it('is not shown a round addressed to a role they do not hold', async () => {
    expect(names(await involvementOf(founder, learner.id))).not.toContain(otherRole.name);
  });

  it('is shown neither a draft nor a closed round — the question is what is being asked NOW', async () => {
    const shown = names(await involvementOf(founder, learner.id));
    expect(shown).not.toContain(notLaunched.name);
    expect(shown).not.toContain(finished.name);
  });

  it('never says whether they answered — INV-006, and the schema could not say it', async () => {
    const rows = await involvementOf(founder, learner.id);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('responded');
      expect(row).not.toHaveProperty('respondedAt');
    }
  });
});

describe('the other direction: a round collecting about them', () => {
  it('wins over the audience rule, and names the subject', async () => {
    const founderPerson = await prisma.node.findFirstOrThrow({
      where: { orgId: founder.orgId, kind: 'person', userId: founder.userId },
      select: { id: true },
    });
    const row = (await involvementOf(founder, founderPerson.id)).find(
      (entry) => entry.id === aboutThem.id,
    );
    expect(row?.reason).toBe('subject');
    expect(row?.via).toBe('Founder — self review');
  });
});

describe('the matcher agrees with the denominator', () => {
  /**
   * THE PAIR TEST. `involvementFor` matches an audience rule in memory; `countAudience`
   * matches the same rule in SQL for `40`'s response rate. Nothing but this holds the two
   * together, and the failure they would produce is silent: a person listed on their own
   * page as being asked for something they are not counted in, or the reverse.
   */
  it('everyone whose page lists a round is inside that round’s own roll', async () => {
    for (const [made, rule] of [
      [roleRound, { kind: 'role' as const, roleId: learnerRoleId }],
      [unitRound, { kind: 'unit' as const, unitId: sectionA, includeSubtree: true }],
    ]) {
      const roll = await countAudience(founder.orgId, rule as never);
      const people = await prisma.node.findMany({
        where: { orgId: founder.orgId, kind: 'person' },
        select: { id: true },
      });
      let listed = 0;
      for (const person of people) {
        const rows = await involvementOf(founder, person.id);
        if (rows.some((row) => row.id === (made as Made).id && row.reason === 'audience')) listed += 1;
      }
      expect(listed).toBe(roll);
    }
  });
});

describe('who may read whose list', () => {
  it('bounds an administrator to the campaigns their own scope already reaches', async () => {
    // A head of Section A. They can SEE this learner — Team A1 is inside their subtree, so
    // `person.read` reaches them and the page loads — and their `campaign.read` stops at the
    // same boundary. Both rounds name the learner by role; only one of them is theirs to read.
    const head = await addStaff(founder.orgId, {
      name: 'Sectional Head A', level: 2, unitName: 'Section A',
    });
    const seen = names(await involvementOf(head, learner.id));
    expect(seen).toContain(roleRound.name);
    expect(seen).not.toContain(roleRoundInB.name);
  });

  it('does not bound a person reading their own, because campaign.read is administrative', async () => {
    // A level-4 member of staff: no campaign.read anywhere, and their own list regardless.
    const junior = await addStaff(founder.orgId, {
      name: 'Junior Learner', level: 4, unitName: 'Team A1',
    });
    const capabilities = (await junior.agent.get('/api/v1/auth/me')).body.capabilities as
      Record<string, string>;
    expect(capabilities['campaign.read']).toBeUndefined();

    const profile = await junior.agent.get('/api/v1/profile');
    expect(profile.status).toBe(200);
    expect(names(profile.body.data.involvement as PersonCampaign[])).toContain(roleRound.name);
  });
});
