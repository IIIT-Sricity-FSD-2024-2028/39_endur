// T-044 — the vocabulary audit's server half. 22 §5, §6, INV-001.
//
// `_MEMORY.md` N-044 wrote the brief for this file after the CSV export shipped with the
// literal word "Subject" as a header: *"every user-facing string the SERVER produces is
// outside the vocabulary check. 22 §6 lists three kinds — validation messages,
// confirmation text, export headers. Only one of the three has been audited."*
//
// These are the other two. Every message below is rendered VERBATIM by a console page —
// ten of them read `error.message` straight out of the envelope — so an English domain
// noun here is INV-001 broken by the API, in a place `audit:vocab` cannot look, because it
// scans the frontend where components render.
//
// The test org's nouns are SETUP_LABELS: Section, Module, Learner, Tutor, Review round.
// None of them is an English default, which is what makes `not.toMatch(/unit/i)` a real
// assertion rather than a coincidence.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  app,
  registerOrg,
  setUpOrg,
  SETUP_ROLES,
  unitIdByName,
  unique,
  withCsrf,
  type Session,
} from './helpers.js';

const message = (res: { body: { error?: { message?: string } } }): string =>
  res.body.error?.message ?? '';

let founder: Session;

beforeAll(async () => {
  founder = await setUpOrg();
});

describe('the structure messages speak the org’s vocabulary — 22 §6', () => {
  it('refuses to delete a unit with children IN THE ORG’S NOUN, and counts in it', async () => {
    // Section A has one child (Team A1), so this is also the plural-agreement case: the
    // line used to build "unit" + "s" by hand, and "Faculty" pluralises to "Faculty".
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'delete', `/api/v1/units/${sectionA}`).send({});

    expect(res.status).toBe(409);
    expect(message(res)).toBe(
      'That section has 1 section inside it. Say where they should go first.',
    );
    expect(message(res)).not.toMatch(/unit/i);
  });

  it('says the org’s noun when the unit being MOVED INTO is not there', async () => {
    // Reparent, not patch: `requireCapability` resolves `params.id` first and answers its
    // own generic "Not found." for an id that is not there, so a bad :id never reaches the
    // service at all. The new PARENT is in the body and is nobody's capability target,
    // which makes this the path where the service's own message is what a reader sees.
    const teamA1 = await unitIdByName(founder.orgId, 'Team A1');
    const res = await withCsrf(founder, 'post', `/api/v1/units/${teamA1}/reparent`).send({
      newParentId: '00000000-0000-4000-8000-000000000000',
    });

    expect(res.status).toBe(404);
    expect(message(res)).toBe('That section does not exist.');
  });

  it('validates the wizard’s structure in the words the wizard is SHOWING', async () => {
    // Mid-setup the database still holds whatever `register` created, and the reader is
    // looking at the vocabulary they picked two steps ago. The message is built from the
    // BODY's labels for that reason — reading the stored ones would answer in the words
    // they are in the middle of replacing.
    const fresh = await registerOrg();
    const res = await withCsrf(fresh, 'post', '/api/v1/org/setup').send({
      industry: 'custom',
      roles: SETUP_ROLES,
      units: [
        { tempId: 'r1', name: 'One', parentTempId: null },
        { tempId: 'r2', name: 'Two', parentTempId: null },
      ],
      labels: { unit: { one: 'Ward', many: 'Wards' } },
    });

    expect(res.status).toBe(409);
    expect(message(res)).toBe('The structure needs exactly one top-level ward.');
  });
});

describe('the campaign messages speak the org’s vocabulary — 22 §6', () => {
  let templateId: string;
  let subjectId: string;

  beforeAll(async () => {
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const subject = await withCsrf(founder, 'post', '/api/v1/subjects').send({
      name: 'Data Structures',
      unitId: sectionA,
    });
    subjectId = subject.body.data.id as string;
    const templates = await founder.agent.get('/api/v1/templates');
    templateId = (templates.body.data as Array<{ id: string; name: string }>)[0]?.id as string;
  });

  const create = async (name: string): Promise<string> => {
    const res = await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name,
      templateId,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
    });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  it('refuses to edit a launched campaign in the org’s noun', async () => {
    const id = await create(unique('Edit me'));
    await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/launch`).send({});
    const res = await withCsrf(founder, 'patch', `/api/v1/campaigns/${id}`).send({ name: 'New' });

    expect(res.status).toBe(409);
    expect(message(res)).toBe(
      'That review round has launched. It can be closed, but not edited.',
    );
    expect(message(res)).not.toMatch(/campaign/i);
  });

  it('refuses a second close in the org’s noun', async () => {
    const id = await create(unique('Close me'));
    await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/launch`).send({});
    await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/close`).send({});
    const res = await withCsrf(founder, 'post', `/api/v1/campaigns/${id}/close`).send({});

    expect(res.status).toBe(409);
    expect(message(res)).toBe('That review round is already closed.');
  });

  it('says the org’s noun on the 404, on BOTH branches', async () => {
    // The two branches — no row, and out of scope — must stay indistinguishable (13 §5).
    // Speaking the org's vocabulary does not change that: what must not vary between them
    // is the answer, not the language it is written in.
    const missing = await founder.agent.get(
      '/api/v1/campaigns/00000000-0000-4000-8000-000000000000',
    );
    expect(missing.status).toBe(404);
    expect(message(missing)).toBe('That review round does not exist.');

    const results = await founder.agent.get(
      '/api/v1/campaigns/00000000-0000-4000-8000-000000000000/results',
    );
    expect(message(results)).toBe('That review round does not exist.');
  });

  it('names the org’s noun when a template is still in use', async () => {
    // "Template" is structural and correctly stays literal — a hotel calls it a template
    // too (22 §1). What it is used BY is the org's word, and the count agrees with it.
    const own = await withCsrf(founder, 'post', '/api/v1/templates').send({
      name: unique('Own form'),
      category: 'General',
    });
    expect(own.status).toBe(201);
    const ownId = own.body.data.id as string;
    await withCsrf(founder, 'put', `/api/v1/templates/${ownId}/questions`).send({
      questions: [
        {
          kind: 'rating',
          text: 'How was it?',
          required: true,
          config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' },
        },
      ],
    });
    await withCsrf(founder, 'post', '/api/v1/campaigns').send({
      name: unique('Using it'),
      templateId: ownId,
      subjectIds: [subjectId],
      audience: { kind: 'anyone' },
    });

    const res = await withCsrf(founder, 'delete', `/api/v1/templates/${ownId}`).send({});
    expect(res.status).toBe(409);
    expect(message(res)).toBe(
      'That template is used by 1 review round. Delete or close those first.',
    );
  });
});

describe('the tenantless routes still answer in words, not in undefined', () => {
  it('falls back to the default vocabulary where no org is resolved', async () => {
    // Login, register and the respondent surface run before any tenant exists. A message
    // builder there must render the generic noun rather than `undefined` — which is the
    // whole reason nounsOf() has a fallback instead of call sites reaching into ctx.
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x', password: 'y' });
    expect(message(res)).not.toMatch(/undefined/);
  });
});
