// The four demo organisations. 50 §3.
//
// Fully populated, with HISTORICAL RESPONSES — not empty shells. An empty org proves the
// schema; a populated one proves the product, and the difference is what the evaluator
// actually sees.
import { estimateSeconds } from '@endur/shared';
import type { QuestionKind } from '@endur/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../../auth/password.js';
import { grantsForLevel, presetFor, type Level } from '../../presets/index.js';
import { mintToken } from '../../features/campaigns/token.js';
import { poolFor, type Tone } from './comments.js';
import { Rng, skewedNps, skewedRating, skewedTimestamp } from './random.js';

const DAY = 24 * 60 * 60 * 1000;

export type DemoOrg = {
  name: string;
  slug: string;
  industry: string;
  /** The RNG seed. Fixed per org, so every run produces the same organisation. */
  seed: number;
  units: Array<{ tempId: string; name: string; parentTempId: string | null }>;
  /** Subject names, and which unit each belongs to. */
  subjects: Array<{ name: string; unit: string }>;
  staff: number;
  campaigns: Array<{
    name: string;
    template: string;
    /** Days ago the window opened; null closedAt means it is still running. */
    startedDaysAgo: number;
    lengthDays: number;
    closed: boolean;
    /** Roughly how many people answer per subject. */
    responsesPerSubject: number;
  }>;
};

export const DEMO_ORGS: DemoOrg[] = [
  {
    name: 'Northfield University',
    slug: 'northfield',
    industry: 'university',
    seed: 1001,
    units: [
      { tempId: 'root', name: 'Northfield University', parentTempId: null },
      { tempId: 'eng', name: 'School of Engineering', parentTempId: 'root' },
      { tempId: 'sci', name: 'School of Science', parentTempId: 'root' },
      { tempId: 'cs', name: 'Computer Science', parentTempId: 'eng' },
      { tempId: 'mech', name: 'Mechanical Engineering', parentTempId: 'eng' },
      { tempId: 'civil', name: 'Civil Engineering', parentTempId: 'eng' },
      { tempId: 'phy', name: 'Physics', parentTempId: 'sci' },
      { tempId: 'chem', name: 'Chemistry', parentTempId: 'sci' },
      { tempId: 'maths', name: 'Mathematics', parentTempId: 'sci' },
    ],
    subjects: [
      { name: 'Data Structures', unit: 'cs' },
      { name: 'Operating Systems', unit: 'cs' },
      { name: 'Databases', unit: 'cs' },
      { name: 'Computer Networks', unit: 'cs' },
      { name: 'Machine Learning', unit: 'cs' },
      { name: 'Software Engineering', unit: 'cs' },
      { name: 'Thermodynamics', unit: 'mech' },
      { name: 'Fluid Mechanics', unit: 'mech' },
      { name: 'Machine Design', unit: 'mech' },
      { name: 'Structural Analysis', unit: 'civil' },
      { name: 'Geotechnics', unit: 'civil' },
      { name: 'Quantum Mechanics', unit: 'phy' },
      { name: 'Electromagnetism', unit: 'phy' },
      { name: 'Organic Chemistry', unit: 'chem' },
      { name: 'Physical Chemistry', unit: 'chem' },
      { name: 'Linear Algebra', unit: 'maths' },
      { name: 'Real Analysis', unit: 'maths' },
      { name: 'Probability', unit: 'maths' },
    ],
    staff: 40,
    campaigns: [
      {
        name: 'Autumn term feedback',
        template: 'Course feedback',
        startedDaysAgo: 300,
        lengthDays: 21,
        closed: true,
        responsesPerSubject: 34,
      },
      {
        name: 'Spring term feedback',
        template: 'Course feedback',
        startedDaysAgo: 160,
        lengthDays: 21,
        closed: true,
        responsesPerSubject: 38,
      },
      {
        name: 'Facilities pulse',
        template: 'Facilities pulse',
        startedDaysAgo: 60,
        lengthDays: 14,
        closed: true,
        responsesPerSubject: 28,
      },
    ],
  },
  {
    name: 'The Grand Palace',
    slug: 'grand-palace',
    industry: 'hotel',
    seed: 2002,
    units: [
      { tempId: 'root', name: 'The Grand Palace', parentTempId: null },
      { tempId: 'city', name: 'City Property', parentTempId: 'root' },
      { tempId: 'coast', name: 'Coastal Property', parentTempId: 'root' },
      { tempId: 'lake', name: 'Lakeside Property', parentTempId: 'root' },
      { tempId: 'city-front', name: 'City Front Office', parentTempId: 'city' },
      { tempId: 'city-house', name: 'City Housekeeping', parentTempId: 'city' },
      { tempId: 'city-food', name: 'City Food and Beverage', parentTempId: 'city' },
      { tempId: 'coast-front', name: 'Coastal Front Office', parentTempId: 'coast' },
      { tempId: 'coast-food', name: 'Coastal Food and Beverage', parentTempId: 'coast' },
    ],
    subjects: [
      { name: 'The Terrace Restaurant', unit: 'city-food' },
      { name: 'Palm Court Bar', unit: 'city-food' },
      { name: 'City Reception', unit: 'city-front' },
      { name: 'City Housekeeping', unit: 'city-house' },
      { name: 'Room Service', unit: 'city-food' },
      { name: 'The Boathouse', unit: 'coast-food' },
      { name: 'Coastal Reception', unit: 'coast-front' },
      { name: 'Spa and Wellness', unit: 'coast' },
      { name: 'Lakeside Dining', unit: 'lake' },
      { name: 'Conference Suites', unit: 'city' },
      { name: 'Valet Parking', unit: 'city-front' },
      { name: 'Concierge', unit: 'city-front' },
    ],
    staff: 25,
    campaigns: [
      {
        name: 'Summer guest survey',
        template: 'Stay experience',
        startedDaysAgo: 120,
        lengthDays: 30,
        closed: true,
        responsesPerSubject: 32,
      },
      {
        name: 'Restaurant feedback',
        template: 'Restaurant feedback',
        startedDaysAgo: 45,
        lengthDays: 21,
        closed: true,
        responsesPerSubject: 18,
      },
    ],
  },
  {
    name: 'Riverside Hospital',
    slug: 'riverside',
    industry: 'hospital',
    seed: 3003,
    units: [
      { tempId: 'root', name: 'Riverside Hospital', parentTempId: null },
      { tempId: 'med', name: 'Medicine', parentTempId: 'root' },
      { tempId: 'surg', name: 'Surgery', parentTempId: 'root' },
      { tempId: 'ward-a', name: 'Ward A', parentTempId: 'med' },
      { tempId: 'ward-b', name: 'Ward B', parentTempId: 'med' },
      { tempId: 'ward-c', name: 'Ward C', parentTempId: 'surg' },
      { tempId: 'ward-d', name: 'Ward D', parentTempId: 'surg' },
    ],
    subjects: [
      { name: 'Inpatient Care', unit: 'ward-a' },
      { name: 'Outpatient Clinic', unit: 'ward-b' },
      { name: 'Day Surgery', unit: 'ward-c' },
      { name: 'Emergency Admissions', unit: 'ward-d' },
      { name: 'Physiotherapy', unit: 'med' },
      { name: 'Radiology', unit: 'med' },
      { name: 'Pharmacy', unit: 'root' },
      { name: 'Discharge Lounge', unit: 'surg' },
    ],
    staff: 30,
    campaigns: [
      {
        name: 'Patient experience survey',
        template: 'Patient experience',
        startedDaysAgo: 90,
        lengthDays: 28,
        closed: true,
        responsesPerSubject: 50,
      },
    ],
  },
  {
    name: 'Meridian Consulting',
    slug: 'meridian',
    industry: 'company',
    seed: 4004,
    units: [
      { tempId: 'root', name: 'Meridian Consulting', parentTempId: null },
      { tempId: 'delivery', name: 'Delivery', parentTempId: 'root' },
      { tempId: 'growth', name: 'Growth', parentTempId: 'root' },
      { tempId: 'platform', name: 'Platform', parentTempId: 'delivery' },
      { tempId: 'analytics', name: 'Analytics', parentTempId: 'delivery' },
      { tempId: 'sales', name: 'Sales', parentTempId: 'growth' },
    ],
    subjects: [
      { name: 'Atlas Migration', unit: 'platform' },
      { name: 'Beacon Rollout', unit: 'platform' },
      { name: 'Compass Redesign', unit: 'analytics' },
      { name: 'Delta Reporting', unit: 'analytics' },
      { name: 'Everest Onboarding', unit: 'delivery' },
      { name: 'Foundry Pilot', unit: 'platform' },
      { name: 'Gateway Integration', unit: 'delivery' },
      { name: 'Harbour Analytics', unit: 'analytics' },
      { name: 'Ironwood Sales Tools', unit: 'sales' },
      { name: 'Juniper Support Desk', unit: 'growth' },
    ],
    staff: 35,
    campaigns: [
      {
        name: 'Half-year review cycle',
        template: 'Manager feedback',
        startedDaysAgo: 150,
        lengthDays: 21,
        closed: true,
        responsesPerSubject: 30,
      },
      {
        name: 'Team health check',
        template: 'Team health',
        startedDaysAgo: 40,
        lengthDays: 14,
        closed: true,
        responsesPerSubject: 20,
      },
    ],
  },
];

const FIRST = [
  'Aarav', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera', 'Arjun', 'Kavya', 'Rohan', 'Divya',
  'Sanjay', 'Neha', 'Karthik', 'Isha', 'Aditya', 'Riya', 'Nikhil', 'Sneha', 'Varun', 'Pooja',
];
const LAST = [
  'Sharma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Desai', 'Kulkarni', 'Menon', 'Joshi', 'Rao',
];

export type SeededLogin = { org: string; email: string; password: string; role: string };

/**
 * Build one demo organisation, end to end, inside a single transaction so a failure
 * halfway leaves nothing behind. `db:reset` is the live recovery path during a demo, and a
 * half-seeded org is worse than an empty database.
 */
export async function seedOrg(
  prisma: PrismaClient,
  spec: DemoOrg,
  password: string,
): Promise<SeededLogin[]> {
  const rng = new Rng(spec.seed);
  const preset = presetFor(spec.industry);
  const passwordHash = await hashPassword(password);
  const logins: SeededLogin[] = [];

  const org = await prisma.organization.create({
    data: {
      name: spec.name,
      slug: spec.slug,
      industry: spec.industry,
      labels: preset.labels,
      settings: { authzVersion: 1, setupCompletedAt: new Date().toISOString() },
    },
    select: { id: true },
  });
  const orgId = org.id;

  // 1 · units and the contains edges.
  const unitIds = new Map<string, string>();
  for (const unit of spec.units) {
    const created = await prisma.node.create({
      data: { orgId, kind: 'unit', name: unit.name },
      select: { id: true },
    });
    unitIds.set(unit.tempId, created.id);
  }
  await prisma.edge.createMany({
    data: spec.units
      .filter((unit) => unit.parentTempId !== null)
      .map((unit) => ({
        orgId,
        type: 'contains' as const,
        parentId: unitIds.get(unit.parentTempId as string) as string,
        childId: unitIds.get(unit.tempId) as string,
      })),
  });

  // 2 · roles, from the preset, with the derived grant matrix on each.
  const roleIds: string[] = [];
  for (const [index, role] of preset.roles.entries()) {
    const created = await prisma.node.create({
      data: { orgId, kind: 'role', name: role.name, level: index + 1 },
      select: { id: true },
    });
    roleIds.push(created.id);
    await prisma.grant.createMany({
      data: grantsForLevel(Math.min(index + 1, 4) as Level).map((grant) => ({
        orgId,
        subjectId: created.id,
        capability: grant.capability,
        scope: grant.scope,
        effect: 'allow' as const,
        derived: true,
      })),
      skipDuplicates: true,
    });
  }

  // 3 · staff. The first is the demo login; the rest populate the org so a people list and
  //     a powers grid have something to show.
  const unitKeys = spec.units.map((unit) => unit.tempId);
  for (let index = 0; index < spec.staff; index += 1) {
    const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    const email =
      index === 0
        ? `admin@${spec.slug}.endur.test`
        : `${spec.slug}-${index}@endur.test`;
    // Level 1 for the first person, then a spread down the hierarchy — most people sit at
    // the bottom, which is what makes a subtree scope visibly different from `all`.
    const level = index === 0 ? 0 : rng.chance(0.15) ? 1 : rng.chance(0.4) ? 2 : 3;
    const unitKey = index === 0 ? 'root' : rng.pick(unitKeys.slice(1));

    const user = await prisma.user.create({
      data: { orgId, email, name, passwordHash, status: 'active' },
      select: { id: true },
    });
    const person = await prisma.node.create({
      data: { orgId, kind: 'person', name, userId: user.id },
      select: { id: true },
    });
    const roleId = roleIds[Math.min(level, roleIds.length - 1)] as string;
    const unitId = unitIds.get(unitKey) as string;

    const position =
      (await prisma.node.findFirst({
        where: { orgId, kind: 'position', roleId, unitId },
        select: { id: true },
      })) ??
      (await prisma.node.create({
        data: {
          orgId,
          kind: 'position',
          name: `${preset.roles[Math.min(level, preset.roles.length - 1)]?.name ?? 'Member'} — ${
            spec.units.find((unit) => unit.tempId === unitKey)?.name ?? ''
          }`,
          roleId,
          unitId,
        },
        select: { id: true },
      }));
    await prisma.edge.create({
      data: { orgId, type: 'member', parentId: person.id, childId: position.id, isPrimary: true },
    });

    if (index === 0) {
      logins.push({
        org: spec.name,
        email,
        password,
        role: preset.roles[0]?.name ?? 'Owner',
      });
    }
  }

  // 4 · templates, copied from the preset.
  const templateIds = new Map<string, string>();
  for (const seed of preset.templates) {
    const template = await prisma.template.create({
      data: {
        orgId,
        name: seed.name,
        category: seed.category,
        industry: preset.key,
        description: seed.description ?? null,
        estimatedSeconds: estimateSeconds(seed.questions.map((question) => question.kind)),
        questions: {
          create: seed.questions.map((question, index) => ({
            kind: question.kind,
            text: question.text,
            config: question.config,
            required: question.required,
            position: index,
          })),
        },
      },
      select: { id: true },
    });
    templateIds.set(seed.name, template.id);
  }

  // 5 · subjects. ONE of them is deliberately poor, so the results screen has something to
  //     show beyond a wall of fours (50 §3).
  const subjectIds = new Map<string, string>();
  const quality = new Map<string, number>();
  for (const [index, subject] of spec.subjects.entries()) {
    const created = await prisma.subject.create({
      data: {
        orgId,
        name: subject.name,
        unitId: unitIds.get(subject.unit) as string,
        type: 'general',
      },
      select: { id: true },
    });
    subjectIds.set(subject.name, created.id);
    // Index 2 is the weak one, everywhere. Fixed rather than random so the demo script can
    // name it and it is the same subject at every rehearsal.
    quality.set(subject.name, index === 2 ? 0.32 : 0.55 + rng.next() * 0.4);
  }

  // 6 · campaigns and their responses.
  for (const campaign of spec.campaigns) {
    const templateId = templateIds.get(campaign.template);
    if (!templateId) continue;

    const startsAt = new Date(Date.now() - campaign.startedDaysAgo * DAY);
    const endsAt = new Date(startsAt.getTime() + campaign.lengthDays * DAY);
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId,
        name: campaign.name,
        audienceRule: { kind: 'anyone' },
        anonymous: true,
        startsAt,
        endsAt,
        publicToken: mintToken(),
        ...(campaign.closed ? { closedAt: endsAt } : {}),
        subjects: {
          create: [...subjectIds.values()].map((subjectId) => ({ subjectId })),
        },
      },
      select: { id: true },
    });

    await seedResponses(prisma, {
      rng,
      industry: spec.industry,
      campaignId: created.id,
      templateId,
      subjects: spec.subjects.map((subject) => ({
        id: subjectIds.get(subject.name) as string,
        quality: quality.get(subject.name) ?? 0.6,
      })),
      perSubject: campaign.responsesPerSubject,
      startsAt,
      endsAt,
    });
  }

  // 7 · the under-subscribed open campaign, so k-anonymity suppression is REACHABLE during
  //     the demo (50 §3, §7). Without it the gate is a paragraph in a doc rather than
  //     something an evaluator can watch happen.
  const pulse = [...templateIds.entries()].find(([name]) => name.includes('pulse'));
  if (pulse) {
    const startsAt = new Date(Date.now() - 3 * DAY);
    const endsAt = new Date(Date.now() + 11 * DAY);
    const firstSubject = [...subjectIds.values()][0] as string;
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: pulse[1],
        name: 'Live pulse',
        audienceRule: { kind: 'anyone' },
        anonymous: true,
        startsAt,
        endsAt,
        publicToken: mintToken(),
        subjects: { create: [{ subjectId: firstSubject }] },
      },
      select: { id: true },
    });

    await seedResponses(prisma, {
      rng,
      industry: spec.industry,
      campaignId: created.id,
      templateId: pulse[1],
      subjects: [{ id: firstSubject, quality: 0.7 }],
      // Deliberately below the k-anon threshold of 5.
      perSubject: 2,
      startsAt,
      endsAt: new Date(),
    });
  }

  return logins;
}

type ResponsePlan = {
  rng: Rng;
  industry: string;
  campaignId: string;
  templateId: string;
  subjects: Array<{ id: string; quality: number }>;
  perSubject: number;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Responses, written with createMany rather than one call per row.
 *
 * `db:reset` has to stay under 30 seconds because it is the recovery path during a live
 * demo (50 §4), and ~3,000 responses at six answers each is ~20,000 rows — which is a
 * couple of seconds in bulk and most of a minute one at a time.
 */
async function seedResponses(prisma: PrismaClient, plan: ResponsePlan): Promise<void> {
  const questions = await prisma.question.findMany({
    where: { templateId: plan.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, config: true },
  });
  if (questions.length === 0) return;

  const responses: Prisma.ResponseCreateManyInput[] = [];
  const plans: Array<{ index: number; quality: number }> = [];

  for (const subject of plan.subjects) {
    // Counts VARY by subject. A uniform hundred per subject reads as fake at a glance.
    const count = Math.max(
      1,
      Math.round(plan.perSubject * (0.6 + plan.rng.next() * 0.8)),
    );
    for (let i = 0; i < count; i += 1) {
      plans.push({ index: responses.length, quality: subject.quality });
      responses.push({
        campaignId: plan.campaignId,
        subjectId: subject.id,
        submittedAt: skewedTimestamp(plan.rng, plan.startsAt, plan.endsAt),
        channel: plan.rng.chance(0.55) ? 'qr' : 'link',
        durationMs: plan.rng.int(25_000, 180_000),
      });
    }
  }

  await prisma.response.createMany({ data: responses });

  const created = await prisma.response.findMany({
    where: { campaignId: plan.campaignId },
    orderBy: { submittedAt: 'asc' },
    select: { id: true, subjectId: true },
  });
  const qualityBySubject = new Map(plan.subjects.map((s) => [s.id, s.quality]));

  const answers: Prisma.AnswerCreateManyInput[] = [];
  for (const response of created) {
    const quality = qualityBySubject.get(response.subjectId ?? '') ?? 0.6;
    for (const question of questions) {
      // Not everybody answers everything. A form where every optional question is filled
      // in is another thing that reads as generated.
      if (question.kind === 'text' && !plan.rng.chance(0.35)) continue;
      answers.push(answerFor(plan, question, quality, response.id));
    }
  }

  await prisma.answer.createMany({ data: answers, skipDuplicates: true });
}

function answerFor(
  plan: ResponsePlan,
  question: { id: string; kind: string; config: unknown },
  quality: number,
  responseId: string,
): Prisma.AnswerCreateManyInput {
  const { rng } = plan;
  const config = question.config as { max?: number; options?: string[] };
  const base = { responseId, questionId: question.id };

  switch (question.kind as QuestionKind) {
    case 'rating': {
      const n = skewedRating(rng, config.max ?? 5, quality);
      // numeric_value written alongside value, never independently (10 §4.4).
      return { ...base, value: { kind: 'rating', n }, numericValue: n };
    }
    case 'nps': {
      const n = skewedNps(rng, quality);
      return { ...base, value: { kind: 'nps', n }, numericValue: n };
    }
    case 'yesno':
      return { ...base, value: { kind: 'yesno', yes: rng.chance(quality) } };
    case 'single':
      return {
        ...base,
        value: { kind: 'single', option: rng.pick(config.options ?? ['—']) },
      };
    case 'multi':
      return {
        ...base,
        value: {
          kind: 'multi',
          options: rng.sample(config.options ?? ['—'], rng.int(1, 2)),
        },
      };
    default: {
      // Tone tracks the subject's quality, so the weak subject's comments read like the
      // weak subject's ratings. Comments that disagree with the numbers are the fastest
      // way to make a results screen look assembled rather than collected.
      const tone: Tone = rng.chance(quality) ? 'positive' : rng.chance(0.5) ? 'mixed' : 'negative';
      return {
        ...base,
        value: { kind: 'text', text: rng.pick(poolFor(plan.industry, tone)) },
      };
    }
  }
}
