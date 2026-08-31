// The two refusals the powers grid was specified with and shipped without, plus its row labels:
//   the lockout guard   - a save leaving nobody able to edit powers is a 409
//   the escalation bound - a save raising a role above the saver is refused
// Both were missing from the save route, which carried the capability check and nothing else - and
// this is the screen where it matters most, because editing a role's row raises everyone holding it.
import { beforeAll, describe, expect, it } from 'vitest';
import { CAPABILITIES } from '@endur/shared';
import { addStaff, setUpOrg, withCsrf, type Session } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

type Cell = { roleId: string; capability: string; scope: string | null; effect?: string };
type Role = { id: string; name: string; level: number };

const rolesOf = async (session: Session): Promise<Role[]> =>
  (await session.agent.get('/api/v1/roles')).body.data as Role[];

const put = (session: Session, cells: Cell[]) =>
  withCsrf(session, 'put', '/api/v1/grants').send({ cells });

// The row labels.

describe('the row labels are the ORGANISATION’s words — D-008', () => {
  let founder: Session;
  beforeAll(async () => {
    // The fixture deliberately renames things, so nothing here matches the code's own vocabulary.
    founder = await setUpOrg();
  });

  it('renders a renamed noun in the capability the grid puts on a row', async () => {
    const res = await founder.agent.get('/api/v1/authz/capabilities');
    expect(res.status).toBe(200);
    const catalogue = res.body.data as Array<{ key: string; label: string }>;
    const label = (key: string) => catalogue.find((entry) => entry.key === key)?.label;

    // What shipped was a hardcoded domain noun on the one grid a hotel administrator reads.
    expect(label('campaign.launch')).toBe('open review rounds for answers');
    expect(label('subject.create')).toBe('add modules');
    expect(label('unit.reparent')).toBe('move sections to a different parent');

    // And no label anywhere still says the generic word.
    const generic = catalogue.filter((entry) => /\bcampaigns?\b|\bsubjects?\b/i.test(entry.label));
    expect(generic).toEqual([]);
  });

  it('says something a person would say for the objects that have NO label', async () => {
    // Some objects have no entry in the organisation's labels at all - they are the product's own
    // furniture rather than the customer's world, so they correctly stay literal.
    const res = await founder.agent.get('/api/v1/authz/capabilities');
    const catalogue = res.body.data as Array<{ key: string; label: string }>;
    const label = (key: string) => catalogue.find((entry) => entry.key === key)?.label;

    expect(label('role.update')).toBe('rename and reorder roles');
    expect(label('person.import')).toBe('import people from a spreadsheet');
    expect(label('template.clone')).toBe('copy a template to build from');
    expect(label('org.delete')).toBe('delete the entire organisation');

    // And the ones that are neither a label nor a plain plural: the cases a string derivation could not
    // have reached however it was written.
    expect(label('grant.update')).toBe('change what every role is allowed to do');
    expect(label('audit.read')).toBe('read the activity log');
    expect(label('simulator.run')).toBe('test what somebody else can see');
  });

  it('no label is a derivation artefact', async () => {
    // The old rule glued the verb to a pluralised object and produced phrases like "read resultses".
    // A table cannot drift like that; this asserts it has not.
    const res = await founder.agent.get('/api/v1/authz/capabilities');
    const catalogue = res.body.data as Array<{ key: string; label: string }>;

    // Checked against the catalogue itself rather than a number typed here.
    expect(catalogue).toHaveLength(CAPABILITIES.length);
    for (const entry of catalogue) {
      // A missing phrase falls back to the raw key deliberately: a key on screen is obvious, where a
      // plausible-looking derivation would ship.
      expect(entry.label).not.toBe(entry.key);
      expect(entry.label).not.toMatch(/eses\b|apikeys|actionplans|checkins/);
    }
  });

  it('uses the same words in a WARNING, because it is the same sentence', async () => {
    // A fresh organisation's only warning names no object, so this provokes one that does: a deny sitting
    // on top of that role's own allow.
    const roles = await rolesOf(founder);
    const tutorId = roles.find((role) => role.level === 3)?.id ?? '';
    const shadow = await put(founder, [
      { roleId: tutorId, capability: 'campaign.launch', scope: 'all', effect: 'allow' },
    ]);
    expect(shadow.status).toBe(200);
    await prisma.grant.create({
      data: {
        orgId: founder.orgId, subjectId: tutorId, capability: 'campaign.launch',
        scope: 'all', effect: 'deny', params: {},
      },
    });

    const res = await founder.agent.get('/api/v1/grants/warnings');
    expect(res.status).toBe(200);
    const messages = (res.body.data as Array<{ message: string }>).map((w) => w.message);

    // The warnings and the row labels come from ONE string builder: a second one would drift, and the
    // drift would arrive as a sentence to an administrator on a screen that claims to explain itself.
    expect(messages).toContainEqual(
      expect.stringContaining('“open review rounds for answers”'),
    );
    expect(messages.some((m) => /\bcampaigns\b/i.test(m))).toBe(false);
  });
});

// The lockout guard.

describe('the lockout guard — 33 § "the one unrecoverable mistake"', () => {
  let founder: Session;
  let principalId = '';
  let tutorId = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    const roles = await rolesOf(founder);
    principalId = roles.find((role) => role.level === 1)?.id ?? '';
    tutorId = roles.find((role) => role.level === 3)?.id ?? '';
  });

  it('refuses a save that would leave nobody able to edit powers', async () => {
    // Only the top level holds the grid capability, so removing it there removes it everywhere - and the
    // capability that would put it back is the one just removed.
    const res = await put(founder, [
      { roleId: principalId, capability: 'grant.update', scope: null },
    ]);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no role able to change powers/i);
  });

  it('allows the same removal when the save hands it to another role first', async () => {
    // The guard is about the RESULTING matrix, never the submitted cells: handing the grid to a different
    // role in one save is legal and must not be blocked.
    // A separate organisation, because that save is a one-way door - which is exactly the case the SCREEN
    // is supposed to warn about before saving.
    const org = await setUpOrg();
    const roles = await rolesOf(org);
    const theirPrincipal = roles.find((role) => role.level === 1)?.id ?? '';
    const theirTutor = roles.find((role) => role.level === 3)?.id ?? '';

    const res = await put(org, [
      { roleId: theirTutor, capability: 'grant.update', scope: 'all', effect: 'allow' },
      { roleId: theirPrincipal, capability: 'grant.update', scope: null },
    ]);
    expect(res.status).toBe(200);
    clearGrantCache();

    // And they cannot get it back: the server is right to refuse, which is why the guard alone is not
    // enough and the screen has to ask first.
    const undo = await put(org, [
      { roleId: theirPrincipal, capability: 'grant.update', scope: 'all', effect: 'allow' },
    ]);
    expect(undo.status).toBe(403);
  });

  it('counts a DENY as not holding it — INV-004', async () => {
    // A role both allowed and denied holds nothing, so a guard that counted rows rather than outcomes
    // would wave this through and lock the organisation out with a matrix that LOOKS like it has a holder.
    const res = await put(founder, [
      { roleId: principalId, capability: 'grant.update', scope: 'all', effect: 'deny' },
    ]);
    expect(res.status).toBe(409);
  });

  it('does not run at all for a save that never mentions grant.update', async () => {
    const res = await put(founder, [
      { roleId: tutorId, capability: 'subject.update', scope: 'own_unit', effect: 'allow' },
    ]);
    expect(res.status).toBe(200);
  });
});

// The escalation bound.

describe('the escalation bound on the grid — INV-012', () => {
  let founder: Session;
  let delegate: Session;
  let sectionHeadId = '';
  let tutorId = '';

  beforeAll(async () => {
    founder = await setUpOrg();
    const roles = await rolesOf(founder);
    sectionHeadId = roles.find((role) => role.level === 2)?.id ?? '';
    tutorId = roles.find((role) => role.level === 3)?.id ?? '';

    // A Section Head handed the powers grid, which is the realistic case: they may edit the matrix, and
    // may not write a row into it that is stronger than they are.
    const handover = await put(founder, [
      { roleId: sectionHeadId, capability: 'grant.update', scope: 'all', effect: 'allow' },
    ]);
    expect(handover.status).toBe(200);
    clearGrantCache();

    delegate = await addStaff(founder.orgId, {
      name: 'Priya Delegate', level: 2, unitName: 'Section A',
    });
  });

  it('refuses a capability the saver does not hold AT ALL', async () => {
    // That capability is top-level only, and nothing about holding the grid implies it.
    const res = await put(delegate, [
      { roleId: tutorId, capability: 'org.delete', scope: 'all', effect: 'allow' },
    ]);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
    // It names the capability: a generic sentence on a button that worked one row above reads as a bug.
    expect(res.body.error.details.capability).toBe('org.delete');
    expect(res.body.error.message).toMatch(/do not hold it yourself/i);
  });

  it('refuses a capability the saver holds only in PART of the organisation', async () => {
    const mine = await delegate.agent.get('/api/v1/auth/me');
    const held = mine.body.capabilities as Record<string, string>;
    // The delegate and the founder hold the same scope WORD - what differs is where it is anchored,
    // which is the entire point.
    expect(held['unit.update']).toBe('subtree');

    // A grid cell names no unit. The role could be given to anybody anywhere, so a saver who
    // reaches Section A and Team A1 — and not Section B — cannot hand this out at all, at
    // ANY scope. A width comparison could not express that.
    const res = await put(delegate, [
      { roleId: tutorId, capability: 'unit.update', scope: 'own_unit', effect: 'allow' },
    ]);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
    expect(res.body.error.details.capability).toBe('unit.update');
    expect(res.body.error.message).toMatch(/everywhere in this organisation/i);
  });

  it('allows a capability the saver DOES hold across the whole organisation', async () => {
    // Templates are organisation-wide and have no unit, so this capability is seeded at the widest scope
    // even for a section head: their reach really is the whole organisation, so the bound has nothing to
    // object to. Same role, same person, different answer - decided by where the grant reaches.
    const mine = await delegate.agent.get('/api/v1/auth/me');
    expect((mine.body.capabilities as Record<string, string>)['template.update']).toBe('all');

    const res = await put(delegate, [
      { roleId: tutorId, capability: 'template.update', scope: 'own_unit', effect: 'allow' },
    ]);
    expect(res.status).toBe(200);
  });

  it('never stands in the way of TAKING a power away', async () => {
    // A deny and a `scope: null` both REDUCE what a role can do. Refusing those would make
    // the bound a weapon: a delegate could be prevented from undoing their own mistake.
    const removal = await put(delegate, [
      { roleId: tutorId, capability: 'template.update', scope: null },
    ]);
    expect(removal.status).toBe(200);

    const block = await put(delegate, [
      { roleId: tutorId, capability: 'org.delete', scope: 'all', effect: 'deny' },
    ]);
    expect(block.status).toBe(200);
  });

  it('does not bound the founder, who holds everything', async () => {
    const res = await put(founder, [
      { roleId: tutorId, capability: 'campaign.launch', scope: 'all', effect: 'allow' },
    ]);
    expect(res.status).toBe(200);
  });

  it('is computed from GRANTS, not from the role level', async () => {
    // The same property the assignment tests assert, and for the same reason: a level comparison would
    // be wrong the moment somebody edits this very grid.
    const grant = await founder.agent.get('/api/v1/grants');
    const cells = grant.body.data as Cell[];
    const headHasOrgDelete = cells.some(
      (cell) => cell.roleId === sectionHeadId && cell.capability === 'org.delete',
    );
    expect(headHasOrgDelete).toBe(false);
    // `org.delete` is `all`-scoped wherever it is seeded, so granting it to the level-2 role
    // gives the delegate genuine org-wide reach — no anchor to argue about.

    // Give the level-2 role `org.delete` outright, and the level-2 delegate can now hand it
    // on — with no level anywhere in the decision.
    await put(founder, [
      { roleId: sectionHeadId, capability: 'org.delete', scope: 'all', effect: 'allow' },
    ]);
    clearGrantCache();

    const res = await put(delegate, [
      { roleId: tutorId, capability: 'org.delete', scope: 'all', effect: 'allow' },
    ]);
    expect(res.status).toBe(200);
  });

  it('leaves the audit trail the grid is required to write', async () => {
    // A refused save must write NOTHING, or the log claims a change that did not happen. The guard runs
    // as middleware, before the transaction opens, which is what makes that true.
    const before = await prisma.auditLog.count({
      where: { orgId: founder.orgId, action: 'grant.update' },
    });
    const refused = await put(delegate, [
      { roleId: tutorId, capability: 'billing.update', scope: 'all', effect: 'allow' },
    ]);
    expect(refused.status).toBe(403);

    const after = await prisma.auditLog.count({
      where: { orgId: founder.orgId, action: 'grant.update' },
    });
    expect(after).toBe(before);
  });
});

/* ---- a self-scoped cell is bounded by holding it, not by holding it everywhere ---- */

describe('a `self` cell is bounded by holding it, not by holding it everywhere — F2', () => {
  let founder: Session;
  let roles: Role[];

  beforeAll(async () => {
    founder = await setUpOrg();
    roles = await rolesOf(founder);
  });

  it('lets the founder give a lower role the improvement loop', async () => {
    // THE FINDING, as the college hit it. `GRANT_MATRIX` writes `reflection.*` and
    // `actionplan.*` at `self` and at NO other scope, and the guard demanded the saver hold
    // the capability everywhere in the organisation before handing it out. Nobody can hold
    // at `all` a capability the matrix only ever writes at `self`, so nobody — including
    // the founder of a Gold organisation that had paid for the feature — could grant it.
    // The refusal was `403 WOULD_ESCALATE` on the one screen documented as the way to fix
    // exactly this.
    //
    // A `self` cell is not a claim on any unit: it lets each holder act on THEMSELVES, and
    // no placement of the role widens that. `authz/escalation.ts` has always read it that
    // way when bounding a position; this is the same reading on the grid.
    const learner = roles.find((role) => role.level === 4) as Role;
    const res = await put(founder, [
      { roleId: learner.id, capability: 'reflection.create', scope: 'self', effect: 'allow' },
      { roleId: learner.id, capability: 'reflection.read', scope: 'self', effect: 'allow' },
    ]);
    expect(res.status).toBe(200);
  });

  it('still refuses a `self` cell for a capability the saver does not hold at all', async () => {
    // The half that must NOT relax. `self` narrows the reach of a power; it does not make
    // an unheld power free to hand out, or a delegate could give a role every verb in the
    // catalogue by writing `self` in the box.
    const tutor = roles.find((role) => role.level === 3) as Role;
    const delegate = await addStaff(founder.orgId, {
      name: 'Dev Delegate', level: 2, unitName: 'Section A',
    });
    const handover = await put(founder, [
      { roleId: roles.find((role) => role.level === 2)?.id as string,
        capability: 'grant.update', scope: 'all', effect: 'allow' },
    ]);
    expect(handover.status).toBe(200);
    clearGrantCache();

    const res = await put(delegate, [
      { roleId: tutor.id, capability: 'org.delete', scope: 'self', effect: 'allow' },
    ]);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOULD_ESCALATE');
  });
});

/* ---- the grid says when a role still holds only its starter row ---- */

describe('the grid says when a role started from the clamped starter row — F4', () => {
  it('warns for the roles below the fourth, and not for the four the matrix describes', async () => {
    // `GRANT_MATRIX` describes four levels and `org/service.ts` gives everything below the
    // fourth the level-4 row, which has no `template.*`, no `campaign.read`, no `booking.*`
    // and no `announcement.create`. A ten-role college therefore comes out of the wizard
    // with six roles that can do almost nothing, and nothing on screen said so — the demo
    // run found it one 403 at a time, from the Mess Manager's template upward.
    const founder = await setUpOrg();
    const extra = await withCsrf(founder, 'post', '/api/v1/roles').send({ name: 'Warden' });
    expect(extra.status).toBe(201);

    const res = await founder.agent.get('/api/v1/grants/warnings');
    expect(res.status).toBe(200);
    const warnings = res.body.data as Array<{ kind: string; roleId?: string }>;
    const thin = warnings.filter((warning) => warning.kind === 'thin_starter_row');
    expect(thin.map((warning) => warning.roleId)).toEqual([extra.body.data.id]);
  });
});
