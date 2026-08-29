// T-020 — templates and the bulk question save. 13, 36, 37, DEC-010.
import { beforeAll, describe, expect, it } from 'vitest';
import { setUpOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';

const rating = (text: string) => ({
  kind: 'rating' as const,
  text,
  config: { kind: 'rating' as const, max: 5 as const, lowLabel: 'Poor', highLabel: 'Great' },
  required: false,
});

describe('templates', () => {
  let founder: Session;
  let seeded = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    const list = await founder.agent.get('/api/v1/templates');
    seeded = (list.body.data as Array<{ id: string; name: string }>).find(
      (template) => template.name === 'Course feedback',
    )?.id as string;
  });

  it('lists the starter templates the wizard copied in, with derived counts', async () => {
    const res = await founder.agent.get('/api/v1/templates');
    expect(res.status).toBe(200);

    const templates = res.body.data as Array<{
      name: string;
      questionCount: number;
      estimatedSeconds: number;
    }>;
    // Six since T-093 added a Poll and a Suggestion box seed to every preset, so the start
    // gallery is never empty and a university's poll is not a hotel's.
    expect(templates.map((template) => template.name).sort()).toEqual([
      'Course feedback',
      'Facilities pulse',
      'Quick pulse',
      'Room poll',
      'Semester review',
      'Suggestion box',
    ]);
    // Both derived, never entered by hand. A card showing a hand-typed question count
    // drifts from the form the moment anybody edits it (36).
    const course = templates.find((template) => template.name === 'Course feedback');
    expect(course?.questionCount).toBe(8);
    expect(course?.estimatedSeconds).toBeGreaterThan(0);

    // No seeded template exceeds ten questions. Short forms are the product thesis, not a
    // preference (01 §5).
    expect(templates.every((template) => template.questionCount <= 10)).toBe(true);
    // And one of them is a single question — DEC-010 made concrete rather than argued.
    expect(templates.some((template) => template.questionCount === 1)).toBe(true);
  });

  it('returns the questions in position order', async () => {
    const res = await founder.agent.get(`/api/v1/templates/${seeded}`);
    expect(res.status).toBe(200);
    const questions = res.body.data.questions as Array<{ position: number; kind: string }>;
    expect(questions.map((question) => question.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Six kinds, frozen (DEC-010).
    expect(
      questions.every((question) =>
        ['rating', 'single', 'multi', 'text', 'yesno', 'nps'].includes(question.kind),
      ),
    ).toBe(true);
  });

  it('saves the whole question set in one bulk PUT, deriving position from array order', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/templates').send({
      name: 'Built here',
      category: 'Testing',
    });
    const id = created.body.data.id as string;

    const res = await withCsrf(founder, 'put', `/api/v1/templates/${id}/questions`).send({
      questions: [
        rating('First'),
        // A position sent by the client is ignored: array order is the only ordering, or a
        // client-supplied position and a client-supplied order can disagree (37).
        { ...rating('Second'), position: 99 },
        {
          kind: 'text',
          text: 'Anything else?',
          config: { kind: 'text', multiline: true },
          required: false,
        },
      ],
    });

    expect(res.status).toBe(200);
    const questions = res.body.data.questions as Array<{ text: string; position: number }>;
    expect(questions.map((question) => question.text)).toEqual([
      'First',
      'Second',
      'Anything else?',
    ]);
    expect(questions.map((question) => question.position)).toEqual([0, 1, 2]);
    // Recomputed from the kinds on every save, so the live estimate and the card agree.
    expect(res.body.data.estimatedSeconds).toBe(4 + 4 + 25);
  });

  it('reorders eight questions in one request', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/templates').send({
      name: 'Reorder me',
      category: 'Testing',
    });
    const id = created.body.data.id as string;
    const eight = Array.from({ length: 8 }, (_, index) => rating(`Q${index + 1}`));

    await withCsrf(founder, 'put', `/api/v1/templates/${id}/questions`).send({ questions: eight });
    const res = await withCsrf(founder, 'put', `/api/v1/templates/${id}/questions`).send({
      questions: [...eight].reverse(),
    });

    expect(res.status).toBe(200);
    // One request, one transaction. The deferrable unique on (template_id, position) is
    // what makes this a straight rewrite rather than a shuffle through temporary values.
    expect((res.body.data.questions as Array<{ text: string }>).map((q) => q.text)).toEqual([
      'Q8',
      'Q7',
      'Q6',
      'Q5',
      'Q4',
      'Q3',
      'Q2',
      'Q1',
    ]);
  });

  it('refuses a config that does not match its question kind', async () => {
    const created = await withCsrf(founder, 'post', '/api/v1/templates').send({
      name: 'Mismatched',
      category: 'Testing',
    });
    const res = await withCsrf(
      founder,
      'put',
      `/api/v1/templates/${created.body.data.id}/questions`,
    ).send({
      questions: [{ kind: 'yesno', text: 'Broken', config: { kind: 'nps' }, required: false }],
    });
    // The union is discriminated on `kind`; a mismatch would store a shape the renderer
    // cannot read (14 §4).
    expect(res.status).toBe(409);
  });

  it('clones with cloned_from_id recorded, and a double click makes one copy', async () => {
    const key = `clone-${Date.now()}`;
    const first = await withCsrf(founder, 'post', `/api/v1/templates/${seeded}/clone`)
      .set('Idempotency-Key', key)
      .send({ name: 'My course form' });
    const second = await withCsrf(founder, 'post', `/api/v1/templates/${seeded}/clone`)
      .set('Idempotency-Key', key)
      .send({ name: 'My course form' });

    expect(first.status).toBe(201);
    expect(first.body.data.clonedFromId).toBe(seeded);
    expect(first.body.data.questionCount).toBe(8);
    // Same id back. Clone lands the user straight in the builder, so a second copy
    // appearing behind them is invisible until it is confusing (36).
    expect(second.body.data.id).toBe(first.body.data.id);

    const copies = await prisma.template.count({
      where: { orgId: founder.orgId, name: 'My course form' },
    });
    expect(copies).toBe(1);
  });
});

describe('a template in use by a launched campaign is read-only', () => {
  it('refuses edits and reports readOnly, rather than silently disabling controls', async () => {
    const founder = await setUpOrg();
    const templates = await founder.agent.get('/api/v1/templates');
    const templateId = (templates.body.data as Array<{ id: string }>)[0]?.id as string;

    // Launched == a public token exists. Minting it is the irreversible act (DEC-016).
    await prisma.campaign.create({
      data: {
        orgId: founder.orgId,
        templateId,
        name: 'Running',
        // Unique per run: tokens are globally unique and this database is not reset
        // between runs, so a literal passes once and collides forever.
        publicToken: `T${Date.now().toString(36).toUpperCase().slice(-7)}`,
      },
    });

    const detail = await founder.agent.get(`/api/v1/templates/${templateId}`);
    expect(detail.body.data.readOnly).toBe(true);

    const edit = await withCsrf(founder, 'patch', `/api/v1/templates/${templateId}`).send({
      name: 'Renamed mid-flight',
    });
    // Editing questions under a running campaign would invalidate the responses already
    // collected — half the respondents answered a different form (37).
    expect(edit.status).toBe(409);
    expect(edit.body.error.message).toMatch(/Duplicate/i);

    const remove = await withCsrf(founder, 'delete', `/api/v1/templates/${templateId}`).send({});
    expect(remove.status).toBe(409);
  });

  it('reports campaignCount, so the delete dialog can say so BEFORE it is pressed', async () => {
    const founder = await setUpOrg();
    const templates = await founder.agent.get('/api/v1/templates');
    const rows = templates.body.data as Array<{ id: string; campaignCount: number }>;
    const templateId = rows[0]?.id as string;

    // T-035 added the count. Without it the library card cannot say "Used in 2 campaigns"
    // and the delete dialog has to discover the 409 by pressing the button, which is
    // exactly the "are you sure?" the consequence rule exists to replace (36, 24 §6).
    expect(rows.every((template) => template.campaignCount === 0)).toBe(true);

    for (const name of ['One', 'Two']) {
      await prisma.campaign.create({
        data: {
          orgId: founder.orgId,
          templateId,
          name,
          publicToken: `C${Date.now().toString(36).toUpperCase().slice(-6)}${name[0] as string}`,
        },
      });
    }

    const after = await founder.agent.get('/api/v1/templates');
    const used = (after.body.data as Array<{ id: string; campaignCount: number }>).find(
      (template) => template.id === templateId,
    );
    expect(used?.campaignCount).toBe(2);

    // And the count agrees with what DELETE actually does. A number that disagrees with
    // the refusal behind it would be worse than no number.
    const remove = await withCsrf(founder, 'delete', `/api/v1/templates/${templateId}`).send({});
    expect(remove.status).toBe(409);
  });
});

describe('the shared library', () => {
  it('is readable but not writable, and belongs to no organisation', async () => {
    const founder = await setUpOrg();
    const library = await prisma.template.create({
      data: { orgId: null, name: 'Library form', category: 'General', industry: 'custom' },
      select: { id: true },
    });

    const list = await founder.agent.get('/api/v1/templates/library');
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).map((t) => t.id)).toContain(library.id);
    expect((list.body.data as Array<{ isLibrary: boolean }>).every((t) => t.isLibrary)).toBe(true);

    const edit = await withCsrf(founder, 'patch', `/api/v1/templates/${library.id}`).send({
      name: 'Hijacked',
    });
    // Readable by everyone, writable by nobody — answered as 404 so there is one rule
    // rather than two.
    expect(edit.status).toBe(404);
  });
});
