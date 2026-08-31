// The vocabulary audit's server half.
// The CSV export once shipped with the literal word "Subject" as a header, and the lesson was that every
// user-facing string the SERVER produces sits outside the automated vocabulary check.
// Every message here is rendered verbatim by a console page, so an English domain noun in one of them
// is the invariant broken by the API, in a place the frontend scan cannot look.
// The test organisation's words are all non-default, which is what makes these assertions real.
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
    // The section has one child, so this is also the plural case: the line used to add an "s" by hand,
    // and not every word pluralises that way.
    const sectionA = await unitIdByName(founder.orgId, 'Section A');
    const res = await withCsrf(founder, 'delete', `/api/v1/units/${sectionA}`).send({});

    expect(res.status).toBe(409);
    expect(message(res)).toBe(
      'That section has 1 section inside it. Say where they should go first.',
    );
    expect(message(res)).not.toMatch(/unit/i);
  });

  it('says the org’s noun when the unit being MOVED INTO is not there', async () => {
    // Reparent rather than patch: the capability check resolves the id first and answers its own generic
    // "not found" for an id that is not there, so a bad id never reaches the service. The new PARENT is in
    // the body and is nobody's permission target, which makes this the path where the service speaks.
    const teamA1 = await unitIdByName(founder.orgId, 'Team A1');
    const res = await withCsrf(founder, 'post', `/api/v1/units/${teamA1}/reparent`).send({
      newParentId: '00000000-0000-4000-8000-000000000000',
    });

    expect(res.status).toBe(404);
    expect(message(res)).toBe('That section does not exist.');
  });

  it('validates the wizard’s structure in the words the wizard is SHOWING', async () => {
    // Mid-wizard the database still holds what registration created, and the reader is looking at the
    // words they picked two steps ago - so the message is built from the BODY's labels.
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
    // The two branches - no row, and out of scope - must stay indistinguishable. Speaking the organisation's
    // vocabulary does not change that: what must not vary is the answer, not the language.
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
    // "Template" is structural and correctly stays literal - a hotel calls it a template too. What it is
    // used BY is the organisation's own word, and the count agrees with it.
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
    // Login, registration and the respondent surface run before any organisation exists, so a message
    // builder there must render the generic noun rather than the word "undefined".
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x', password: 'y' });
    expect(message(res)).not.toMatch(/undefined/);
  });
});
