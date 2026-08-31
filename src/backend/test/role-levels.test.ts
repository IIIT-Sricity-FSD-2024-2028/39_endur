// A role ladder longer than four.
// The seeded matrix's four rows are places in the FEEDBACK LOOP, not places in the list: the third is
// the reviewee and the fourth is the respondent who gives feedback.
// The old mapping counted from the top, so a ten-role college put SIX roles on the respondent row and
// a Professor signed in to an empty console with five capabilities.
// The assertions are on capabilities a person would NOTICE missing, never on the level number - a test
// that only checked the number would pass against an emptied row.
import { describe, expect, it } from 'vitest';
import { levelForRole } from '../presets/grant-matrix.js';
import { registerOrg, withCsrf, SETUP_UNITS, SETUP_LABELS } from './helpers.js';
import { prisma } from '../db/client.js';
import { clearGrantCache } from '../authz/index.js';

// A real college ladder, which is the shape that broke.
const COLLEGE_ROLES = [
  'Director',
  'Dean',
  'Head of Department',
  'Professor',
  'Assistant Professor',
  'Hostel Manager',
  'Mess Manager',
  'Sports Officer',
  'Support Staff',
  'Student',
].map((name) => ({ name }));

describe('levelForRole — DEC-112', () => {
  // Four roles or fewer is unchanged, which is what lets this change ship at all: every seeded preset
  // has exactly four, so no existing organisation moves.
  it('leaves a four-role ladder exactly where it was', () => {
    expect([0, 1, 2, 3].map((i) => levelForRole(i, 4))).toEqual([1, 2, 3, 4]);
    expect([0, 1, 2].map((i) => levelForRole(i, 3))).toEqual([1, 2, 3]);
    expect([0, 1].map((i) => levelForRole(i, 2))).toEqual([1, 2]);
  });

  // The bottom role is the respondent and the middle is the reviewee: only ONE role takes the bottom row
  // now, where six of ten used to.
  it('gives a ten-role ladder one respondent row, not six', () => {
    const levels = COLLEGE_ROLES.map((_, i) => levelForRole(i, COLLEGE_ROLES.length));
    expect(levels).toEqual([1, 2, 3, 3, 3, 3, 3, 3, 3, 4]);
    expect(levels.filter((level) => level === 4)).toHaveLength(1);
    // The old rule, written out so the difference is legible rather than implied.
    const old = COLLEGE_ROLES.map((_, i) => Math.min(i + 1, 4));
    expect(old.filter((level) => level === 4)).toHaveLength(7);
  });

  // A Dean is not handed the organisation: the top row carries delete and the powers grid.
  it('never promotes anybody into level 1 by being generous', () => {
    for (const count of [5, 6, 8, 10, 12]) {
      const levels = Array.from({ length: count }, (_, i) => levelForRole(i, count));
      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      expect(levels[0]).toBe(1);
    }
  });
});

describe('a ten-role college gets a working Professor — F4, F2', () => {
  it('gives the fourth role the reviewee row, and the last role the respondent row', async () => {
    const founder = await registerOrg('university', 'gold');
    const res = await withCsrf(founder, 'post', '/api/v1/org/setup').send({
      industry: 'university',
      roles: COLLEGE_ROLES,
      units: SETUP_UNITS,
      labels: SETUP_LABELS,
    });
    expect(res.status).toBe(201);
    clearGrantCache();

    const roles = await prisma.node.findMany({
      where: { orgId: founder.orgId, kind: 'role' },
      orderBy: { level: 'asc' },
      select: { id: true, name: true, level: true },
    });
    expect(roles).toHaveLength(10);

    const capsOf = async (roleName: string): Promise<Set<string>> => {
      const role = roles.find((entry) => entry.name === roleName);
      expect(role, roleName).toBeTruthy();
      const grants = await prisma.grant.findMany({
        where: { orgId: founder.orgId, subjectId: role!.id, effect: 'allow' },
        select: { capability: true },
      });
      return new Set(grants.map((grant) => grant.capability));
    };

    const professor = await capsOf('Professor');
    // The five-capability console is gone: each of these is a screen that was 403 or empty.
    expect(professor.has('campaign.read')).toBe(true);
    expect(professor.has('campaign.create')).toBe(true);
    expect(professor.has('results.read')).toBe(true);
    expect(professor.has('response.read')).toBe(true);
    expect(professor.has('template.read')).toBe(true);
    // The improvement loop: it is self-scoped at the top three levels and absent at the fourth, so a
    // reviewee below fourth place lost the whole tier AND could not be granted it back.
    expect(professor.has('reflection.create')).toBe(true);
    expect(professor.has('actionplan.create')).toBe(true);
    expect(professor.size).toBeGreaterThan(10);

    // The Assistant Professor is a reviewee too, and used to be on the respondent row.
    const assistant = await capsOf('Assistant Professor');
    expect(assistant.has('campaign.read')).toBe(true);
    expect(assistant.has('reflection.create')).toBe(true);

    // The Sports Officer's job needs a bookable and a campaign in their own unit.
    const sports = await capsOf('Sports Officer');
    expect(sports.has('campaign.create')).toBe(true);
    expect(sports.has('template.read')).toBe(true);

    // And the student is STILL the respondent: handing the bottom of the ladder the reviewee's powers
    // would be a worse bug than the one being fixed.
    const student = await capsOf('Student');
    expect(student.has('campaign.create')).toBe(false);
    expect(student.has('response.read')).toBe(false);
    expect(student.has('results.read')).toBe(false);
    expect(student.has('reflection.create')).toBe(false);
    expect(student.has('subject.read')).toBe(true);
    expect(student.has('announcement.read')).toBe(true);
  });

  // The warning narrows with the fix: it used to name six roles, and the honest count is one.
  it('warns about the bottom role only, not about six', async () => {
    const founder = await registerOrg('university', 'gold');
    expect(
      (await withCsrf(founder, 'post', '/api/v1/org/setup').send({
        industry: 'university',
        roles: COLLEGE_ROLES,
        units: SETUP_UNITS,
        labels: SETUP_LABELS,
      })).status,
    ).toBe(201);
    clearGrantCache();

    const res = await founder.agent.get('/api/v1/grants/warnings');
    expect(res.status).toBe(200);
    const thin = (res.body.data as Array<{ kind: string; roleId: string }>)
      .filter((warning) => warning.kind === 'thin_starter_row');
    expect(thin).toHaveLength(1);

    const student = await prisma.node.findFirst({
      where: { orgId: founder.orgId, kind: 'role', name: 'Student' },
      select: { id: true },
    });
    expect(thin[0]?.roleId).toBe(student?.id);
  });
});
