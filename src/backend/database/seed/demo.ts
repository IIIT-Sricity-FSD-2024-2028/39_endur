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
import type { Tier } from '@endur/shared';

const DAY = 24 * 60 * 60 * 1000;

export type DemoOrg = {
  name: string;
  slug: string;
  industry: string;
  /**
   * ONE ORG PER TIER, which is what D-012 asked for and what makes the 402 path demonstrable
   * on a real organisation rather than only in a test.
   *
   * The assignment follows the demo script (50 §5) rather than being alphabetical. Northfield
   * is opened first and is where the improve loop lives, so it is Gold. The Grand Palace is
   * step 2 and keeps analysis, so Silver. Riverside is Bronze — somebody has to be, and the
   * screen that says "that feature is not included in your plan" is only convincing on an org
   * that genuinely is not on it. Meridian is Enterprise, a tier no picker offers (DEC-048),
   * which is the only way to see that operator-assigned tiers are real.
   */
  tier: Tier;
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
    tier: 'gold',
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
    tier: 'silver',
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
    tier: 'bronze',
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
    tier: 'enterprise',
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

  // The subscription, written for the same reason `register` writes one (DEC-048): an org
  // without a row falls through requireEntitlement's bronze backstop, and a demo org silently
  // on the wrong tier is a demo that proves the opposite of what it claims. A year from today,
  // billing nothing — see auth/service.ts for why the period is honest but inert.
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  await prisma.subscription.create({
    data: { orgId, tier: spec.tier, status: 'active', periodStart, periodEnd },
  });

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
  let adminUserId = '';
  let adminName = '';
  // A second person, captured for the reflect loop's check-in — a plan is reviewed by
  // somebody other than its author, and picking one at seed time is simpler than resolving
  // "who supervises the admin" from the grant table for a demo that only needs one row.
  let supervisorUserId = '';
  const staffUserIds: string[] = [];
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
    staffUserIds.push(user.id);
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
      adminUserId = user.id;
      adminName = name;
      logins.push({
        org: spec.name,
        email,
        password,
        role: preset.roles[0]?.name ?? 'Owner',
      });
    }
    if (index === 1) {
      supervisorUserId = user.id;
    }
  }
  if (!supervisorUserId) supervisorUserId = adminUserId;

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

  // 5b · the admin's own self-review subject, linked by `linkedUserId` — the ONLY thing
  //      `myCycle()` checks (improve/service.ts). Without a subject like this the demo
  //      login has no reviewee row anywhere and /app/reflect is permanently empty, on
  //      every org, regardless of how much else is seeded.
  const selfSubjectName = `${adminName} — Self Review`;
  const selfSubject = await prisma.subject.create({
    data: {
      orgId,
      name: selfSubjectName,
      unitId: unitIds.get('root') as string,
      type: 'person',
      linkedUserId: adminUserId,
    },
    select: { id: true },
  });

  // 6 · campaigns and their responses.
  const campaignRecords: Array<{
    id: string;
    name: string;
    templateId: string;
    closed: boolean;
    startsAt: Date;
    endsAt: Date;
  }> = [];
  for (const [campaignIndex, campaign] of spec.campaigns.entries()) {
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
          // The self-review subject rides along on every regular campaign, exactly like
          // any other subject — that is what makes it a cycle rather than a fixture.
          create: [...subjectIds.values(), selfSubject.id].map((subjectId) => ({ subjectId })),
        },
      },
      select: { id: true },
    });
    campaignRecords.push({ id: created.id, name: campaign.name, templateId, closed: campaign.closed, startsAt, endsAt });

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

    // Only the FIRST campaign gets crowd responses on the self subject too, and enough of
    // them to clear the k-anon threshold — that is the one cycle whose gap actually
    // renders. The rest stay reviewee-only, which is what keeps their cycles at "due"
    // instead of every single one resolving on day one of a fresh database.
    if (campaignIndex === 0) {
      await seedResponses(prisma, {
        rng,
        industry: spec.industry,
        campaignId: created.id,
        templateId,
        subjects: [{ id: selfSubject.id, quality: 0.72 }],
        perSubject: 12,
        startsAt,
        endsAt,
      });
    }
  }

  // 6b · the self-review reflection, plan, and check-in for that first campaign — so
  //      /app/reflect opens on a FINISHED loop (44's three steps, all done) rather than
  //      an evaluator having to run the whole thing live to see what it looks like.
  const anchor = campaignRecords[0];
  if (anchor) {
    await seedSelfReflection(prisma, {
      orgId,
      campaignId: anchor.id,
      templateId: anchor.templateId,
      subjectId: selfSubject.id,
      authorUserId: adminUserId,
      supervisorUserId,
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

  // 7b · T-096. ONE PUBLISHED ANNOUNCEMENT AND ONE OPEN BOOKABLE, on the orgs whose tier
  //      actually buys them. A silver org gets the announcement; a gold or enterprise org
  //      gets both. Seeding a gold feature onto the bronze org would put a row on a screen
  //      that answers 402 — the demo would show a bookable nobody in that organisation can
  //      open, which teaches the opposite of what the tier ladder is there to teach.
  const tierRank = ['bronze', 'silver', 'gold', 'enterprise'].indexOf(spec.tier);

  if (tierRank >= 1) {
    // Published, with RECEIPTS FOR EVERY MEMBER OF STAFF — written here exactly as
    // `publishAnnouncement` writes them, because the number that makes the feature worth
    // looking at is a fraction and a fraction needs a denominator (13 § Announcements).
    const announcement = await prisma.announcement.create({
      data: {
        orgId,
        title: 'Fire drill on Friday',
        body: 'Everybody out by the north stair at 11:00. It should take about ten minutes.',
        audienceRule: { kind: 'anyone' },
        createdById: adminUserId,
        publishedAt: new Date(Date.now() - 2 * DAY),
      },
      select: { id: true },
    });
    await prisma.announcementReceipt.createMany({
      data: staffUserIds.map((userId, index) => ({
        announcementId: announcement.id,
        userId,
        // A THIRD OF THEM HAVE READ IT. Nought of forty reads as broken and forty of forty
        // reads as fake; a real fraction is the only one that looks like a working product.
        // The admin is NOT among them, so their own banner is unread when they sign in and
        // the feature is visible on Home without navigating to it.
        readAt: index > 0 && index % 3 === 0 ? new Date(Date.now() - DAY) : null,
      })),
      skipDuplicates: true,
    });
  }

  if (tierRank >= 2) {
    // The bookable, open, with THREE SLOTS AND THE MIDDLE ONE NEARLY FULL. That last part
    // is the whole reason this is seeded rather than created on stage: "1 left" is the state
    // the capacity work exists to produce, and waiting for four volunteers to book from the
    // audience is not a demo, it is a queue.
    const firstSubjectId = [...subjectIds.values()][0] as string;
    const bookable = await prisma.bookable.create({
      data: {
        orgId,
        name: 'Consultation slots',
        description: 'Fifteen minutes each. Pick a time that suits you.',
        subjectId: firstSubjectId,
        publicToken: mintToken(),
      },
      select: { id: true },
    });

    const base = new Date();
    base.setHours(10, 0, 0, 0);
    base.setTime(base.getTime() + DAY);
    const slots = await Promise.all(
      [0, 1, 2].map((index) =>
        prisma.slot.create({
          data: {
            bookableId: bookable.id,
            startsAt: new Date(base.getTime() + index * 60 * 60 * 1000),
            endsAt: new Date(base.getTime() + index * 60 * 60 * 1000 + 45 * 60 * 1000),
            capacity: index === 1 ? 3 : 2,
          },
          select: { id: true },
        }),
      ),
    );

    // Two of the middle slot's three places taken, so it renders "1 left" the moment the
    // page loads. Names and emails are fixtures and identified ON PURPOSE — a booking is a
    // different privacy contract from a response (DEC-090), and the seed is where that
    // difference first becomes visible on screen.
    const takers = [
      { slot: 1, name: 'Asha Nair', email: 'asha.nair@example.test' },
      { slot: 1, name: 'Daniel Okafor', email: 'daniel.okafor@example.test' },
      { slot: 0, name: 'Wei Zhang', email: 'wei.zhang@example.test' },
    ];
    await prisma.booking.createMany({
      data: takers.map((taker) => ({
        slotId: slots[taker.slot]?.id as string,
        name: taker.name,
        email: taker.email,
        cancelToken: mintToken(),
      })),
    });
  }

  // 8 · the activity log. Written directly rather than earned through the middleware,
  //     because a seed run does not make real requests — but `56`'s reader does not care
  //     how a row got there, only that it is shaped like one `requireCapability` would have
  //     written. Without this, "Activity log" is a permanently empty screen on every demo
  //     org, which is not a state a walkthrough can show anybody anything from.
  await seedActivityLog(prisma, {
    orgId,
    adminUserId,
    supervisorUserId,
    unitIds,
    roleIds,
    subjectIds,
    templateIds,
    campaignRecords,
    staffUserIds,
  });

  return logins;
}

/**
 * The self-reviewee's own reflection, action plan, and one check-in — the whole `44` loop,
 * finished, on the campaign the reviewee just got real crowd responses on. Answers are
 * generic rather than random: this is one fixed row an evaluator will open and read, not
 * three thousand nobody looks at individually (contrast `answerFor`, which is the opposite
 * case on purpose).
 */
async function seedSelfReflection(
  prisma: PrismaClient,
  params: {
    orgId: string;
    campaignId: string;
    templateId: string;
    subjectId: string;
    authorUserId: string;
    supervisorUserId: string;
  },
): Promise<void> {
  const questions = await prisma.question.findMany({
    where: { templateId: params.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, config: true },
  });
  if (questions.length === 0) return;

  const answers = questions.map((question) => {
    const config = question.config as { max?: number; options?: string[] };
    switch (question.kind) {
      case 'rating':
        return { questionId: question.id, value: { kind: 'rating', n: Math.max(1, (config.max ?? 5) - 1) } };
      case 'nps':
        return { questionId: question.id, value: { kind: 'nps', n: 8 } };
      case 'yesno':
        return { questionId: question.id, value: { kind: 'yesno', yes: true } };
      case 'single':
        return { questionId: question.id, value: { kind: 'single', option: (config.options ?? ['—'])[0] } };
      case 'multi':
        return {
          questionId: question.id,
          value: { kind: 'multi', options: (config.options ?? ['—']).slice(0, 1) },
        };
      default:
        return {
          questionId: question.id,
          value: {
            kind: 'text',
            text: 'I think this went well overall, but I could have set clearer priorities earlier on.',
          },
        };
    }
  });

  const reflection = await prisma.reflection.create({
    data: {
      orgId: params.orgId,
      campaignId: params.campaignId,
      subjectId: params.subjectId,
      authorUserId: params.authorUserId,
      answers,
      submittedAt: new Date(Date.now() - 6 * DAY),
    },
    select: { id: true },
  });

  const plan = await prisma.actionPlan.create({
    data: {
      orgId: params.orgId,
      reflectionId: reflection.id,
      items: [
        { text: 'Set clearer weekly priorities with the team', dueAt: null, status: 'open' },
        { text: 'Run a monthly retro on what slowed delivery down', dueAt: null, status: 'open' },
      ],
      finalisedAt: new Date(Date.now() - 4 * DAY),
    },
    select: { id: true },
  });

  await prisma.checkin.create({
    data: {
      orgId: params.orgId,
      actionPlanId: plan.id,
      supervisorUserId: params.supervisorUserId,
      notes: 'Good progress — priorities are visibly clearer in standups now.',
      heldAt: new Date(Date.now() - 1 * DAY),
    },
  });
}

/**
 * A believable spread of activity-log rows, spanning the capabilities `56`'s reader
 * actually filters on (`action`, `targetType`, `outcome`) — including one denial, since a
 * log that only ever shows allows does not demonstrate the column exists.
 */
async function seedActivityLog(
  prisma: PrismaClient,
  params: {
    orgId: string;
    adminUserId: string;
    supervisorUserId: string;
    unitIds: Map<string, string>;
    roleIds: string[];
    subjectIds: Map<string, string>;
    templateIds: Map<string, string>;
    campaignRecords: Array<{ id: string; name: string; closed: boolean }>;
    staffUserIds: string[];
  },
): Promise<void> {
  const rootUnitId = params.unitIds.get('root') as string;
  const someSubjectId = [...params.subjectIds.values()][0] ?? null;
  const someTemplateId = [...params.templateIds.values()][0] ?? null;
  const someRoleId = params.roleIds[0] ?? null;
  const firstCampaign = params.campaignRecords[0] ?? null;
  const lastCampaign = params.campaignRecords.at(-1) ?? null;
  const otherPersonId = params.staffUserIds[2] ?? params.staffUserIds[0] ?? null;

  const rows: Array<{
    actorUserId: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    outcome: 'allowed' | 'denied';
    decidedBy?: Record<string, unknown>;
    daysAgo: number;
  }> = [
    { actorUserId: params.adminUserId, action: 'org.update', targetType: 'unit', targetId: rootUnitId, outcome: 'allowed', daysAgo: 29 },
    ...(someTemplateId
      ? [{ actorUserId: params.adminUserId, action: 'template.create', targetType: 'template', targetId: someTemplateId, outcome: 'allowed' as const, daysAgo: 27 }]
      : []),
    ...(someRoleId
      ? [{ actorUserId: params.adminUserId, action: 'role.update', targetType: 'role', targetId: someRoleId, outcome: 'allowed' as const, daysAgo: 24 }]
      : []),
    ...(someSubjectId
      ? [{ actorUserId: params.supervisorUserId, action: 'subject.create', targetType: 'subject', targetId: someSubjectId, outcome: 'allowed' as const, daysAgo: 21 }]
      : []),
    ...(otherPersonId
      ? [{ actorUserId: params.adminUserId, action: 'person.create', targetType: 'person', targetId: otherPersonId, outcome: 'allowed' as const, daysAgo: 20 }]
      : []),
    ...(firstCampaign
      ? [
          { actorUserId: params.adminUserId, action: 'campaign.create', targetType: 'campaign', targetId: firstCampaign.id, outcome: 'allowed' as const, daysAgo: 18 },
          { actorUserId: params.adminUserId, action: 'campaign.launch', targetType: 'campaign', targetId: firstCampaign.id, outcome: 'allowed' as const, daysAgo: 18 },
        ]
      : []),
    ...(otherPersonId
      ? [{
          actorUserId: params.supervisorUserId,
          action: 'person.update',
          targetType: 'person',
          targetId: otherPersonId,
          outcome: 'allowed' as const,
          daysAgo: 12,
        }]
      : []),
    ...(someSubjectId
      ? [{
          // The one denial — a scope that legitimately does not reach this subject, not a
          // bug (44 § the deny-always-beats-allow invariant, DEC- table in `_MEMORY.md`).
          actorUserId: params.supervisorUserId,
          action: 'subject.archive',
          targetType: 'subject',
          targetId: someSubjectId,
          outcome: 'denied' as const,
          decidedBy: { via: 'default', effect: 'deny' },
          daysAgo: 9,
        }]
      : []),
    ...(lastCampaign && lastCampaign.closed
      ? [{ actorUserId: params.adminUserId, action: 'campaign.close', targetType: 'campaign', targetId: lastCampaign.id, outcome: 'allowed' as const, daysAgo: 5 }]
      : []),
    { actorUserId: params.adminUserId, action: 'org.read', targetType: 'unit', targetId: rootUnitId, outcome: 'allowed', daysAgo: 1 },
  ];

  await prisma.auditLog.createMany({
    data: rows.map((row) => ({
      orgId: params.orgId,
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      outcome: row.outcome,
      ...(row.decidedBy ? { decidedBy: row.decidedBy as Prisma.InputJsonValue } : {}),
      requestId: null,
      createdAt: new Date(Date.now() - row.daysAgo * DAY),
    })),
  });
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
