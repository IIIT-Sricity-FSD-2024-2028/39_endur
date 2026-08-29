// `POST /authz/simulate` — 42, 13 § Trust. The explain path.
//
// `D-014` recorded this route as unmounted. It has been mounted since `T-053`; what was
// actually missing was any test at all, which is how three type errors accumulated inside
// `runSimulation` without a single check going red (`D-035`, repaid 29 Aug together with
// this file). A route nothing exercises is a route nobody notices rotting.
//
// THE ONE PROPERTY THAT MATTERS is that the simulator returns the decision the system
// would ACTUALLY make. `simulate()` is three lines wrapping `resolve()` precisely so that
// it cannot drift into a second implementation (_MEMORY.md N-005); the tests below check
// the wrapper's own job — resolving a DTO target into a `Target` — and check that the
// answer it hands back still carries the trace that makes it worth asking.
import { beforeAll, describe, expect, it } from 'vitest';
import { addStaff, setUpOrg, unitIdByName, withCsrf, type Session } from './helpers.js';

describe('POST /authz/simulate', () => {
  let founder: Session;
  let head: Session;
  let sectionA: string;
  let teamA1: string;
  let sectionB: string;

  beforeAll(async () => {
    founder = await setUpOrg();
    head = await addStaff(founder.orgId, {
      name: 'Section Head A',
      level: 2,
      unitName: 'Section A',
    });
    [sectionA, teamA1, sectionB] = await Promise.all([
      unitIdByName(founder.orgId, 'Section A'),
      unitIdByName(founder.orgId, 'Team A1'),
      unitIdByName(founder.orgId, 'Section B'),
    ]);
  });

  it('allows what the head can really do, and names the grant that decided it', async () => {
    const res = await withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
      principalUserId: head.userId,
      capability: 'unit.create',
      target: { kind: 'unit', unitId: teamA1 },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(true);
    expect(res.body.data.reason).toBe('granted');
    // INV-007. Without this the answer is an assertion; with it, it is evidence.
    expect(res.body.data.decidedBy).toBeTruthy();
    expect(res.body.data.decidedBy.scope).toBe('subtree');
  });

  it('blocks the same power one section across, and says out_of_scope rather than no_grant', async () => {
    // The distinction `42` calls the most useful thing on the screen: the head HAS this
    // power, it simply does not reach Section B. "No rule grants this" would be a lie.
    const res = await withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
      principalUserId: head.userId,
      capability: 'unit.create',
      target: { kind: 'unit', unitId: sectionB },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.allowed).toBe(false);
    expect(res.body.data.reason).toBe('out_of_scope');
    // The rejected candidate is what makes the counterfactual renderable (11 §10).
    const considered = res.body.data.considered as Array<{ rejectedBecause?: string }>;
    expect(considered.length).toBeGreaterThan(0);
    expect(considered.some((row) => row.rejectedBecause)).toBe(true);
  });

  it('answers about the org itself, and about a section the head does own', async () => {
    const [org, own] = await Promise.all([
      withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
        principalUserId: head.userId,
        capability: 'org.delete',
        target: { kind: 'org' },
      }),
      withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
        principalUserId: head.userId,
        capability: 'unit.create',
        target: { kind: 'unit', unitId: sectionA },
      }),
    ]);

    expect(org.body.data.allowed).toBe(false);
    expect(org.body.data.reason).toBe('no_grant');
    expect(own.body.data.allowed).toBe(true);
  });

  it('accepts an explicit "at", and means NOW when it is left out', async () => {
    // `at` is optional and absence means now — so it is spread in rather than passed as an
    // explicit `undefined`, which under exactOptionalPropertyTypes is not the same thing.
    // Both shapes are sent here because only one of them used to compile.
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const [dated, undated] = await Promise.all([
      withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
        principalUserId: head.userId,
        capability: 'unit.create',
        target: { kind: 'unit', unitId: teamA1 },
        at: future,
      }),
      withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
        principalUserId: head.userId,
        capability: 'unit.create',
        target: { kind: 'unit', unitId: teamA1 },
      }),
    ]);

    expect(dated.status).toBe(200);
    expect(undated.status).toBe(200);
    // The seeded grants have no end date, so a week out is the same answer. The point is
    // that the route ANSWERS both, not that the two decisions differ.
    expect(dated.body.data.allowed).toBe(true);
    expect(undated.body.data.allowed).toBe(true);
  });

  it('refuses a capability that does not exist instead of quietly reporting no_grant', async () => {
    // Before the DTO validated against the catalogue, a typo resolved to `no_grant` — and
    // on the simulator that renders as "no rule grants this", which is a real-looking
    // answer to a question the system never understood.
    const res = await withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
      principalUserId: head.userId,
      capability: 'unit.creat',
      target: { kind: 'org' },
    });

    // 422 VALIDATION_FAILED, the same shape any bad body gets (13 § Errors) — the check
    // belongs in the DTO, not in the service, so the answer is the ordinary one.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('404s a target belonging to no organisation rather than deciding about it', async () => {
    const res = await withCsrf(founder, 'post', '/api/v1/authz/simulate').send({
      principalUserId: head.userId,
      capability: 'subject.read',
      target: { kind: 'subject', subjectId: '00000000-0000-4000-8000-000000000000' },
    });

    expect(res.status).toBe(404);
  });

  it('is guarded by simulator.run, which a level-3 role does not hold', async () => {
    // 11 §3 seeds it to levels 1 and 2 only: the trace reveals the org's whole permission
    // structure, so it is not a default-for-everyone read.
    const tutor = await addStaff(founder.orgId, {
      name: 'Tutor A',
      level: 3,
      unitName: 'Section A',
    });

    const res = await withCsrf(tutor, 'post', '/api/v1/authz/simulate').send({
      principalUserId: founder.userId,
      capability: 'org.read',
      target: { kind: 'org' },
    });

    expect(res.status).toBe(403);
  });
});
