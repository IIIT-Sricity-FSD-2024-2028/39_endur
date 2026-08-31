// IIIT Sri City — one hand-built organisation, on the highest tier, with its history already run.
//
// WHY IT IS NOT A `DemoOrg` ROW. `demo.ts` generates an organisation from a shape: N staff,
// scattered across the units at random levels, answering the preset's forms. That is the right
// tool for proving the product on four industries at once, and it cannot say any of the things
// this college needs said — that the Dean is a named person who is ALSO a member of faculty,
// that the head of BH1 deliberately is NOT, that one student sits in three places at once, or
// that a washing machine in BH1 has been broken for a fortnight and somebody wrote in about it.
// So this file states the organisation instead of generating it, and shares `responses.ts` with
// `demo.ts` so the two never disagree about what a plausible spread of ratings looks like.
//
// THE ONE STRUCTURAL IDEA IS THE THIRD DIMENSION. A student belongs to a department, a hostel
// and a mess at the same time, and those are three different trees over the same 30 people —
// which is why the counts reconcile three different ways to the same number: 10+10+10 by branch,
// 15+15 by hostel, 18+12 by mess. `edges` is built for exactly this ("across dimensions a node
// may have many parents"), so each student holds three `member` edges and nobody is duplicated
// to make the arithmetic work.
//
// THE SECOND IDEA IS THAT A DENOMINATOR IS EITHER REAL OR ABSENT. A campaign covering seven
// courses collects roughly three responses per student, so dividing by a head count would print
// 300% — the fault 40 and `D-044` are both about. Multi-subject cycles here therefore carry
// `{ kind: 'anyone' }` and show NO rate; the single-subject polls carry the Student role and
// show a true one. Which rule a campaign gets is a judgement about honesty, not a default.
//
// EDUCATION NOUNS ARE DATA HERE AND ONLY HERE (INV-002). `database/seed/**` is one of the two
// directories exempt in eslint.config.js and in test/seed.test.ts. Every "Dean", "Faculty" and
// "Student" below is a string in a row; rename them and this is a hospital.
import { randomUUID } from 'node:crypto';
import { estimateSeconds } from '@endur/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../../auth/password.js';
import { grantsForLevel, presetFor, type Level } from '../../presets/index.js';
import { mintToken } from '../../features/campaigns/token.js';
import { newPeriod } from '../../billing/period.js';
import { seedBillingHistory } from './billing-history.js';
import { ORGANISATION_SUBJECT } from '../../features/campaigns/visibility.js';
import { Rng } from './random.js';
import { seedResponses } from './responses.js';
import type { SeededLogin } from './demo.js';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const IIIT_SLUG = 'iiit-sri-city';
export const IIIT_NAME = 'IIIT Sri City';

/** Fixed, so every run of `db:seed` builds the same college down to the last rating. */
const SEED = 4004;

// ---------------------------------------------------------------------------
// The org chart, as data
// ---------------------------------------------------------------------------

/** One tree, three branches. `contains` edges only — `unitSubtree` walks these and nothing else. */
const UNITS = [
  { key: 'root', name: IIIT_NAME, parent: null },

  { key: 'academics', name: 'Academics', parent: 'root' },
  { key: 'cse', name: 'CSE', parent: 'academics' },
  { key: 'ece', name: 'ECE', parent: 'academics' },
  { key: 'aids', name: 'AIDS', parent: 'academics' },

  { key: 'hostels', name: 'Hostels', parent: 'root' },
  { key: 'bh1', name: 'BH1', parent: 'hostels' },
  { key: 'bh2', name: 'BH2', parent: 'hostels' },

  { key: 'mess', name: 'Mess', parent: 'root' },
  { key: 'mess-a', name: 'Mess A', parent: 'mess' },
  { key: 'mess-b', name: 'Mess B', parent: 'mess' },
] as const;

type UnitKey = (typeof UNITS)[number]['key'];

/**
 * The role ladder. `level` is the GRANT-MATRIX row (50 §1), assigned deliberately rather than
 * derived with `levelForRole` — that helper's rule is "the top three keep 1, 2 and 3 and the
 * last gets 4", which would put Chief Warden a whole row above Mess Warden for no reason but
 * the order they happen to be listed in. These nine roles are three tiers of authority, not
 * nine, and three pairs of them are exact peers.
 *
 * `order` is `nodes.level`, which is ordering only and never enforcement (§2.4, CONF-002).
 */
const ROLES = [
  // Runs the institute. The only role holding `grant.update`, so the powers grid always has
  // somebody who can edit it — `assertSomebodyCanStillEditPowers` refuses to leave zero.
  { key: 'director', name: 'Director', order: 1, level: 1 as Level },

  // Three heads of three verticals, and they are peers: `subtree` from wherever each is
  // anchored, which is Academics, Hostels and Mess respectively.
  { key: 'dean', name: 'Dean', order: 2, level: 2 as Level },
  { key: 'chief-warden', name: 'Chief Warden', order: 3, level: 2 as Level },
  { key: 'mess-warden', name: 'Mess Warden', order: 4, level: 2 as Level },

  // Heads of one place each. `own_unit` on campaigns and results — a department, a hostel block
  // or a single mess is the whole of what they answer for.
  { key: 'hod', name: 'Head of Department', order: 5, level: 3 as Level },
  { key: 'caretaker', name: 'Hostel Caretaker', order: 6, level: 3 as Level },
  { key: 'vendor', name: 'Vendor Manager', order: 7, level: 3 as Level },

  // The reviewee level: reads its own results and nothing above it.
  { key: 'faculty', name: 'Faculty', order: 8, level: 3 as Level },

  // The respondent row, and none of these 30 people has an account at all (DEC-009).
  { key: 'student', name: 'Student', order: 9, level: 4 as Level },
] as const;

type RoleKey = (typeof ROLES)[number]['key'];

/**
 * Courses. Six belong to one department each; SEED belongs to `academics`.
 *
 * WHY SEED IS ANCHORED AT THE PARENT AND NOT DUPLICATED THREE TIMES. A subject has one
 * `unit_id`, so a course all three branches take is either one row above them or three rows
 * beside them — and three rows is three separate result sets that never add up, which is the
 * one thing a common course must not be. At `academics` it is inside every department head's
 * `subtree` and inside the Dean's, which is exactly who should see it.
 *
 * The abbreviations are the owner's own and are left unexpanded on purpose: guessing what
 * FDFED or SS stands for would put an invention on a screen somebody reads as a fact.
 */
const COURSES: Array<{ name: string; unit: UnitKey; quality: number }> = [
  { name: 'DSA', unit: 'cse', quality: 0.74 },
  // The weak one, and the one the whole improvement story hangs off.
  { name: 'FDFED', unit: 'cse', quality: 0.34 },
  { name: 'VLSI', unit: 'ece', quality: 0.58 },
  { name: 'SS', unit: 'ece', quality: 0.66 },
  { name: 'ML', unit: 'aids', quality: 0.79 },
  { name: 'Gen AI', unit: 'aids', quality: 0.71 },
  { name: 'SEED', unit: 'academics', quality: 0.77 },
];

/**
 * The places, as things feedback is collected ABOUT. A hostel with a warden and no subject is
 * an org chart; with one it is a feedback loop, which is what the product is for.
 *
 * `Hostel Services` and `Mess Services` sit on the PARENT units for the same reason SEED does:
 * a poll about Tuesday's dinner is one question asked once, not the same question asked twice
 * and answered in two result sets nobody can add together.
 */
const FACILITIES: Array<{ name: string; unit: UnitKey; quality: number }> = [
  { name: 'BH1', unit: 'bh1', quality: 0.41 },
  { name: 'BH2', unit: 'bh2', quality: 0.63 },
  { name: 'Mess A', unit: 'mess-a', quality: 0.62 },
  // The other end of the mess story: B is the one with a real problem.
  { name: 'Mess B', unit: 'mess-b', quality: 0.29 },
  { name: 'Hostel Services', unit: 'hostels', quality: 0.52 },
  { name: 'Mess Services', unit: 'mess', quality: 0.48 },
];

/** 10 faculty, 4 + 2 + 4. The index ranges matter: each HOD is drawn from their own department. */
const FACULTY_BY_DEPARTMENT: Array<{ unit: UnitKey; count: number }> = [
  { unit: 'cse', count: 4 },
  { unit: 'ece', count: 2 },
  { unit: 'aids', count: 4 },
];

const STUDENTS_TOTAL = 30;

/**
 * A student's address, DERIVED IN ONE PLACE. Two things need it — the `users` row at 5 and the
 * evaluation booking at 14 — and two independent copies of this expression is exactly how a
 * booking ends up naming somebody the People list has never heard of.
 */
const studentEmail = (name: string): string =>
  `${name.toLowerCase().replace(/\s+/g, '.')}@student.${IIIT_SLUG}.endur.test`;

/** 6 teams of 5, which is every student exactly once. */
const TEAM_COUNT = 6;
const TEAM_SIZE = 5;

const FIRST = [
  'Aarav', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera', 'Arjun', 'Kavya', 'Rohan', 'Divya',
  'Sanjay', 'Neha', 'Karthik', 'Isha', 'Aditya', 'Riya', 'Nikhil', 'Sneha', 'Varun', 'Pooja',
  'Harsha', 'Lakshmi', 'Tejas', 'Anjali', 'Manoj', 'Swathi', 'Girish', 'Bhavya', 'Naveen', 'Deepa',
  'Praveen', 'Sruthi', 'Yashwanth', 'Nandini', 'Kiran', 'Vaishnavi', 'Sandeep', 'Charitha',
  'Abhinav', 'Keerthi',
];
const LAST = [
  'Sharma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Desai', 'Kulkarni', 'Menon', 'Joshi', 'Rao',
  'Chowdary', 'Varma', 'Prasad', 'Naidu', 'Gupta', 'Bose', 'Kamath', 'Pillai', 'Shetty', 'Bhat',
  'Mishra', 'Sinha', 'Acharya', 'Raju',
];

// ---------------------------------------------------------------------------
// What people actually wrote
// ---------------------------------------------------------------------------
//
// Hand-written, per subject, and NOT drawn from `comments.ts`. That pool is written per
// INDUSTRY, so it has something plausible to say about lecture pacing and nothing at all to say
// about a broken washing machine. These are the sentences a reader follows from a suggestion
// box, through a poll, to the thing that got fixed — which is the difference between an
// organisation that is populated and one that is believable.

const COURSE_COMMENTS: Record<string, string[]> = {
  DSA: [
    'The recursion week finally made sense once the call stack was drawn out on the board.',
    'Tutorials are genuinely useful. The assignment deadlines all land in the same week as FDFED though.',
    'More practice problems on graphs before the endsem would help a lot.',
    'Saturday doubt sessions were the most useful hour of my week.',
    'Pace is right. The autograder feedback could say which case failed.',
  ],
  FDFED: [
    'The evaluation criteria for the team project were never written down anywhere.',
    'Five weeks on the frontend and one on the backend, and the endsem weighted them the same.',
    'Six people to a team is too many. Two of us wrote almost all of it.',
    'The lab machines do not have the runtime version the assignment needs, so everyone works on laptops.',
    'Slides go up the night before the exam rather than before the class.',
    'The idea of the course is good and the sequencing is what is hurting it.',
    'We were told the rubric would be shared in week 3. It was shared after the submission.',
  ],
  VLSI: [
    'The tool licences run out during the lab slot almost every week.',
    'Theory coverage is solid. The lab needs one more TA.',
    'Simulations take longer to run than the lab slot allows for.',
    'Good course, but please book the lab for the full two hours.',
  ],
  SS: [
    'The Fourier section was taught really well and the intuition came first for once.',
    'Too much of the term went on the first two chapters.',
    'The tutorial sheets are excellent. Please keep them exactly as they are.',
    'Would like the recorded derivations to stay up after the exam.',
  ],
  ML: [
    'The assignments are hard in the right way.',
    'More time on evaluation metrics and less on the derivations, please.',
    'Best structured course this semester by a distance.',
    'The dataset for assignment 2 was too clean to be interesting.',
  ],
  'Gen AI': [
    'Genuinely current material, which is rare.',
    'The compute quota runs out about halfway through the assignment.',
    'More hands-on sessions and fewer slides.',
    'Please say at the start which parts will be examined.',
  ],
  SEED: [
    'The cross-branch teams were the best part. I worked with people I would never have met.',
    'SEED is the only course where the three branches actually mix. Keep it.',
    'The open-ended brief was hard at first and worth it by the end.',
    'Reviews came back quickly and were specific.',
    'A smaller final report and more demo time would make it better.',
    'Good that it is common. Bad that it clashes with the FDFED evaluation week.',
  ],
};

const HOSTEL_REVIEW_COMMENTS: Record<string, string[]> = {
  BH1: [
    'Two of the four washing machines have been out of order for a fortnight.',
    'Water pressure on the third floor drops to nothing between 7 and 9 in the morning.',
    'The common room is fine. The laundry is the only real problem.',
    'Cleaning staff are good and turn up on time. The complaint register does not go anywhere.',
    'Wi-Fi in the rooms is much weaker than in the common area.',
    'Would be good to know who to actually tell when something breaks.',
  ],
  BH2: [
    'Noticeably better since the water heaters were replaced last term.',
    'Rooms are clean. The reading room is too small for the number of people using it.',
    'Laundry is fine here, which makes the BH1 situation odder.',
    'Lights in the corridor on the second floor flicker at night.',
    'No complaints worth writing down.',
  ],
};

const MESS_REVIEW_COMMENTS: Record<string, string[]> = {
  'Mess A': [
    'Breakfast is consistently good. Dinner variety could be better.',
    'The salad counter is a genuine improvement over last semester.',
    'Queues at 8:15 are long, but it moves.',
    'Would like one more South Indian option at dinner.',
    'Portion sizes are fair and the staff are polite.',
  ],
  'Mess B': [
    'The same three dinners rotate all week.',
    'Food is often cold by the time the second batch is served.',
    'Hygiene near the wash area needs attention.',
    'It has got worse since the vendor changed. A is noticeably better.',
    'Breakfast is fine. Dinner is the problem, every day.',
    'Please fix the cold food before adding anything new to the menu.',
  ],
};

/** The suggestion box is a single open question, so every response here IS a comment. */
const HOSTEL_SUGGESTIONS: Record<string, string[]> = {
  BH1: [
    'The two washing machines on the ground floor have been broken for two weeks now. Three complaints in the register and no one has come to look at them. 60 of us are sharing the two that work.',
    'Please put up a notice when a machine is reported broken, so we stop queueing for it.',
    'Can we get a second drinking water point on the top floor?',
    'The washing machine situation is the single thing that would improve life here.',
    'Repairs get logged and then nothing happens. A visible ticket status would fix half of it.',
    'Bicycle stand needs a roof before the monsoon.',
  ],
  BH2: [
    'A microwave in the pantry would be genuinely useful.',
    'The reading room needs more plug points.',
    'Please extend common room hours during the exam weeks.',
  ],
};

const MESS_SUGGESTIONS: Record<string, string[]> = {
  'Mess A': [
    'Please keep the salad counter running at dinner too, not just lunch.',
    'A weekly menu on the noticeboard would help people plan.',
    'More fruit at breakfast.',
  ],
  'Mess B': [
    'Serve the second batch from a fresh tray. The food being cold is the whole complaint.',
    'Please rotate the dinner menu across two weeks instead of one.',
    'Let students vote on one dinner a week and it will fix half the grumbling.',
    'The wash area needs cleaning more than once a day.',
  ],
};

const ACADEMIC_SUGGESTIONS: Record<string, string[]> = {
  FDFED: [
    'Publish the evaluation rubric in week 1 and the team project becomes a good course.',
    'Cap teams at four people.',
  ],
  SEED: [
    'Please do not schedule the SEED demo in the same week as the FDFED evaluation.',
    'Keep the cross-branch teams. That is the whole value of the course.',
  ],
  DSA: ['A second tutorial slot in the week before the endsem.'],
  VLSI: ['Extend the tool licences or stagger the lab batches.'],
};

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

export async function seedIiitSriCity(
  prisma: PrismaClient,
  password: string,
): Promise<SeededLogin[]> {
  const rng = new Rng(SEED);
  // The university preset supplies the vocabulary and the starter forms. Its four roles are NOT
  // used — this organisation declares its own nine above.
  const preset = presetFor('university');
  const passwordHash = await hashPassword(password);
  const logins: SeededLogin[] = [];

  const org = await prisma.organization.create({
    data: {
      name: IIIT_NAME,
      slug: IIIT_SLUG,
      industry: 'university',
      labels: preset.labels,
      settings: { authzVersion: 1, setupCompletedAt: new Date().toISOString() },
    },
    select: { id: true },
  });
  const orgId = org.id;

  // The highest tier there is. Enterprise is operator-assigned rather than self-serve
  // (DEC-048 / DEC-100), which is why it is written here and not chosen at sign-up.
  // The captures that paid for it are written at 5b, once the Director exists to be the payer.
  await prisma.subscription.create({
    data: { orgId, tier: 'enterprise', status: 'active', ...newPeriod() },
  });

  // 1. Units.
  const unitId = new Map<UnitKey, string>();
  for (const unit of UNITS) {
    const created = await prisma.node.create({
      data: { orgId, kind: 'unit', name: unit.name },
      select: { id: true },
    });
    unitId.set(unit.key, created.id);
  }
  await prisma.edge.createMany({
    data: UNITS.filter((unit) => unit.parent !== null).map((unit) => ({
      orgId,
      type: 'contains' as const,
      parentId: unitId.get(unit.parent as UnitKey) as string,
      childId: unitId.get(unit.key) as string,
    })),
  });

  // 2. Roles, each with its own matrix row applied.
  const roleId = new Map<RoleKey, string>();
  for (const role of ROLES) {
    const created = await prisma.node.create({
      data: { orgId, kind: 'role', name: role.name, level: role.order },
      select: { id: true },
    });
    roleId.set(role.key, created.id);
    await prisma.grant.createMany({
      data: grantsForLevel(role.level).map((grant) => ({
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

  // 3. Positions. One per (role, unit) pair that anybody actually holds — a position is a seat,
  //    and the 10 students in CSE share one rather than minting ten identical ones.
  const positions = new Map<string, string>();
  const positionRows: Prisma.NodeCreateManyInput[] = [];
  const seat = (role: RoleKey, unit: UnitKey): string => {
    const key = `${role}@${unit}`;
    const existing = positions.get(key);
    if (existing) return existing;
    const id = randomUUID();
    positions.set(key, id);
    positionRows.push({
      id,
      orgId,
      kind: 'position',
      name: `${ROLES.find((entry) => entry.key === role)?.name ?? 'Member'} — ${
        UNITS.find((entry) => entry.key === unit)?.name ?? ''
      }`,
      roleId: roleId.get(role) as string,
      unitId: unitId.get(unit) as string,
    });
    return id;
  };

  // 4. People. Every member of staff is named and placed rather than scattered, because the
  //    point of this organisation is that you can sign in as one particular person and see
  //    exactly what the API decided to give them.
  const people: Prisma.NodeCreateManyInput[] = [];
  const members: Prisma.EdgeCreateManyInput[] = [];
  const users: Prisma.UserCreateManyInput[] = [];
  const staffUserIds: string[] = [];
  const usedNames = new Set<string>();

  const nextName = (): string => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  };

  /** A member of staff: an account, a person node, and one or more seats. The FIRST seat is the
   *  primary one — for the six who hold two, that is deliberately the leadership seat. */
  const addStaff = (
    email: string,
    seats: Array<{ role: RoleKey; unit: UnitKey }>,
  ): { userId: string; personId: string; name: string } => {
    const name = nextName();
    const userId = randomUUID();
    const personId = randomUUID();
    users.push({ id: userId, orgId, email, name, passwordHash, status: 'active' });
    people.push({ id: personId, orgId, kind: 'person', name, userId });
    staffUserIds.push(userId);
    for (const [index, held] of seats.entries()) {
      members.push({
        orgId,
        type: 'member',
        parentId: personId,
        childId: seat(held.role, held.unit),
        isPrimary: index === 0,
      });
    }
    return { userId, personId, name };
  };

  const director = addStaff(`admin@${IIIT_SLUG}.endur.test`, [{ role: 'director', unit: 'root' }]);

  // 4a. The 10 faculty, laid out department by department so the indices below are stable.
  const facultyUnits: UnitKey[] = FACULTY_BY_DEPARTMENT.flatMap((department) =>
    Array.from({ length: department.count }, () => department.unit),
  );

  /**
   * The six who wear two hats, by index into `facultyUnits` (CSE 0–3, ECE 4–5, AIDS 6–9).
   *
   * "Dean (also a faculty)", "chief warden (also a faculty)", "mess warden (also a faculty)" —
   * so they are faculty person-nodes holding a SECOND position, not separate people and not a
   * separate headcount. That is what makes 10 the number of faculty and 15 the number of staff.
   * Each HOD is drawn from inside the department they head.
   */
  const SECOND_HAT: Record<number, { role: RoleKey; unit: UnitKey; email: string }> = {
    0: { role: 'dean', unit: 'academics', email: `dean@${IIIT_SLUG}.endur.test` },
    1: { role: 'hod', unit: 'cse', email: `hod.cse@${IIIT_SLUG}.endur.test` },
    2: { role: 'chief-warden', unit: 'hostels', email: `chief.warden@${IIIT_SLUG}.endur.test` },
    4: { role: 'hod', unit: 'ece', email: `hod.ece@${IIIT_SLUG}.endur.test` },
    5: { role: 'mess-warden', unit: 'mess', email: `mess.warden@${IIIT_SLUG}.endur.test` },
    6: { role: 'hod', unit: 'aids', email: `hod.aids@${IIIT_SLUG}.endur.test` },
  };

  // KEPT, not discarded, because 7 assigns each course a named owner and 16 makes that owner a
  // reviewee. `addStaff` already returns the ids; throwing them away and looking the person back
  // up by email later would be a second answer to "who teaches DSA" that could disagree with this one.
  const faculty: Array<{ userId: string; personId: string; name: string }> = [];
  for (const [index, department] of facultyUnits.entries()) {
    const hat = SECOND_HAT[index];
    const seats: Array<{ role: RoleKey; unit: UnitKey }> = hat
      ? // Leadership seat first, so it is the primary one and the People list leads with it.
        [{ role: hat.role, unit: hat.unit }, { role: 'faculty', unit: department }]
      : [{ role: 'faculty', unit: department }];
    faculty.push(addStaff(hat?.email ?? `faculty-${index + 1}@${IIIT_SLUG}.endur.test`, seats));
  }

  // 4b. The support staff who run a place and are explicitly NOT faculty. One seat each, and
  //     that single seat is the whole of the distinction the owner drew.
  const caretakerBh1 = addStaff(`caretaker.bh1@${IIIT_SLUG}.endur.test`, [{ role: 'caretaker', unit: 'bh1' }]);
  const caretakerBh2 = addStaff(`caretaker.bh2@${IIIT_SLUG}.endur.test`, [{ role: 'caretaker', unit: 'bh2' }]);
  const vendorMessA = addStaff(`vendor.mess-a@${IIIT_SLUG}.endur.test`, [{ role: 'vendor', unit: 'mess-a' }]);
  const vendorMessB = addStaff(`vendor.mess-b@${IIIT_SLUG}.endur.test`, [{ role: 'vendor', unit: 'mess-b' }]);

  // 5. The 30 students, each with a NAME AND AN ADDRESS AND NO WAY IN.
  //
  //    THE ROW IS `status: 'invited'` WITH A NULL HASH, WHICH IS THE ONE STATE THAT CANNOT BE
  //    SIGNED IN TO. That is not a compromise on DEC-009, it is the shape `createPerson()`
  //    already writes for every person added through the product — schema.prisma says so above
  //    `AccountInvite`: "a `users` row already exists for every person in the graph, written by
  //    createPerson() with `status = 'invited'` and a NULL passwordHash". A roster seeded WITHOUT
  //    those rows was the seed disagreeing with the only route that creates people, and it showed:
  //    an email is stored on `users` and nowhere else, so all 30 opened on "No account. They
  //    cannot sign in." with no address to write to.
  //
  //    DEC-009 IS ABOUT ANSWERING, AND NOTHING HERE TOUCHES IT. Every seeded campaign is
  //    `access: 'public'`, the token stays the only credential, `responses` still has no column
  //    that could name a respondent (INV-006), and nobody accepts an invite that is never minted
  //    — there is no `AccountInvite` row for any of these 30.
  //
  //    AND IT STILL COSTS THE COLLEGE NOTHING: `seatsFor` counts `status: 'active'`, so the
  //    billable seat count is the 15 members of staff, exactly as it was before.
  //
  //    Branch, hostel and mess are INTERLEAVED rather than aligned, because a hostel whose
  //    residents are all one branch is not a hostel — and the arithmetic still lands exactly:
  //    10/10/10, 15/15, 18/12.
  const studentNames: string[] = [];
  // Deliberately NOT merged into `staffUserIds`: that list is who an announcement is addressed to
  // at 15, and a student is not an administrator.
  const studentUserIds: string[] = [];
  for (let index = 0; index < STUDENTS_TOTAL; index += 1) {
    const personId = randomUUID();
    const userId = randomUUID();
    const name = nextName();
    studentNames.push(name);
    // No `passwordHash`, so the column stays NULL: an account that exists to be written to and
    // listed, and that no password will open.
    users.push({ id: userId, orgId, email: studentEmail(name), name, status: 'invited' });
    people.push({ id: personId, orgId, kind: 'person', name, userId });
    studentUserIds.push(userId);

    const department: UnitKey = index < 10 ? 'cse' : index < 20 ? 'ece' : 'aids';
    const hostel: UnitKey = index % 2 === 0 ? 'bh1' : 'bh2';
    // 3 in every 5 eat at Mess A: 18 and 12, cutting across both other trees.
    const mess: UnitKey = index % 5 < 3 ? 'mess-a' : 'mess-b';

    members.push(
      { orgId, type: 'member', parentId: personId, childId: seat('student', department), isPrimary: true },
      { orgId, type: 'member', parentId: personId, childId: seat('student', hostel), isPrimary: false },
      { orgId, type: 'member', parentId: personId, childId: seat('student', mess), isPrimary: false },
    );
  }

  // Written in bulk. Positions go first — the member edges reference them.
  await prisma.node.createMany({ data: positionRows });
  await prisma.user.createMany({ data: users });
  await prisma.node.createMany({ data: people });
  await prisma.edge.createMany({ data: members, skipDuplicates: true });

  // 5b. The billing past, written once the Director exists to be named as the payer.
  // ENTERPRISE IS NOT SELF-SERVE (DEC-048 / DEC-100), and the history says so: a Bronze signup
  // through the public flow, then a `change` up to Enterprise — which is the shape
  // `approveEnterpriseRequest` writes, priced from the tier they were actually on. Seeding a
  // signup straight onto Enterprise would describe a purchase no route in the product allows.
  await seedBillingHistory(prisma, {
    orgId,
    tier: 'enterprise',
    payerName: director.name,
    payerEmail: `admin@${IIIT_SLUG}.endur.test`,
  });

  // 6. Templates. The preset's five are cloned the way the setup wizard clones them, and two
  //    more are written here because "How would you rate the study spaces?" is not a question
  //    about a mess, and a form that does not ask about the thing gets answers about nothing.
  const templateId = new Map<string, string>();
  const addTemplate = async (
    name: string,
    category: string,
    description: string | null,
    // `position` is supplied below from the array order, so a caller writing a form never has
    // to keep two lists in step.
    questions: Array<Omit<Prisma.QuestionCreateWithoutTemplateInput, 'position'>>,
  ): Promise<string> => {
    const created = await prisma.template.create({
      data: {
        orgId,
        name,
        category,
        industry: preset.key,
        description,
        estimatedSeconds: estimateSeconds(questions.map((question) => question.kind)),
        questions: {
          create: questions.map((question, index) => ({ ...question, position: index })),
        },
      },
      select: { id: true },
    });
    templateId.set(name, created.id);
    return created.id;
  };

  for (const template of preset.templates) {
    await addTemplate(
      template.name,
      template.category,
      template.description ?? null,
      template.questions.map((question) => ({
        kind: question.kind,
        text: question.text,
        config: question.config,
        required: question.required,
      })),
    );
  }

  const rate = (
    text: string,
    lowLabel: string,
    highLabel: string,
    required = false,
  ): Omit<Prisma.QuestionCreateWithoutTemplateInput, 'position'> => ({
    kind: 'rating',
    text,
    config: { kind: 'rating', max: 5, lowLabel, highLabel },
    required,
  });

  await addTemplate('Hostel review', 'Facilities', 'Six questions about the block you live in.', [
    rate('How clean are the common areas and corridors?', 'Poor', 'Excellent', true),
    rate('How reliable are water and electricity?', 'Unreliable', 'Reliable'),
    rate('How well does the laundry work for you?', 'Badly', 'Well'),
    {
      kind: 'yesno',
      text: 'When you last reported something broken, was it fixed in a reasonable time?',
      config: { kind: 'yesno' },
      required: false,
    },
    { kind: 'nps', text: 'How likely are you to recommend this block to a junior?', config: { kind: 'nps' }, required: false },
    {
      kind: 'text',
      text: 'What is the one thing that would most improve this hostel?',
      config: { kind: 'text', placeholder: 'One thing' },
      required: false,
    },
  ]);

  await addTemplate('Mess feedback', 'Facilities', 'Six questions. Answers in under a minute.', [
    rate('How would you rate the food quality overall?', 'Poor', 'Excellent', true),
    rate('How would you rate hygiene in the dining and wash areas?', 'Poor', 'Excellent'),
    rate('How much variety is there across the week?', 'Very little', 'Plenty'),
    {
      kind: 'single',
      text: 'Which meal needs the most work?',
      config: { kind: 'single', options: ['Breakfast', 'Lunch', 'Snacks', 'Dinner'], allowOther: false },
      required: false,
    },
    { kind: 'nps', text: 'How likely are you to recommend this mess to a friend?', config: { kind: 'nps' }, required: false },
    {
      kind: 'text',
      text: 'What should the vendor change first?',
      config: { kind: 'text', placeholder: 'One thing' },
      required: false,
    },
  ]);

  // 7. Subjects: seven courses and six places, ELEVEN OF THEM WITH A NAMED PERSON ANSWERABLE.
  //
  //    `linked_user_id` IS THE ONLY PERSON-TO-SUBJECT LINK THE SCHEMA HAS, and it is the whole
  //    of what makes a subject a REVIEWEE rather than a heading. Without it `mySubjects()`
  //    returns nothing, `/app/reflect` is empty for all 15 members of staff, and the Faculty
  //    role — described three screens up as "the reviewee level: reads its own results" — has
  //    nothing it is the reviewee OF. It also decides `reason: 'subject'` in `features/people/involvement.ts`
  //    block, which is how a person's own page says "this round is about you".
  //
  //    OWNERSHIP IS DRAWN FROM THE UNIT, NEVER ACROSS IT. Every course goes to somebody holding
  //    a faculty seat in that course's own department, every block to its own caretaker, every
  //    mess to its own vendor manager. SEED is the exception that proves it: it is anchored at
  //    `academics` because all three branches take it, so its reviewee is the Dean, who is
  //    anchored there too.
  //
  //    `Hostel Services` and `Mess Services` ARE DELIBERATELY LEFT UNOWNED. They are the
  //    parent-level subjects the system-wide polls hang off, and the Chief Warden and Mess
  //    Warden already reach them by `subtree`. Linking them as well would make one complaint
  //    about laundry arrive twice — once at BH1's caretaker and once again at their supervisor
  //    as a reflection of their own — and a reviewee whose results are somebody else's results
  //    is the one thing a gap must never be.
  const OWNER: Record<string, string> = {
    // CSE. The HOD teaches DSA; FDFED — the weak one, and the course the whole improvement
    // story hangs off — belongs to a plain member of faculty, so the loop at 16 runs at the
    // reviewee level rather than at an administrator's.
    DSA: (faculty[1] as { userId: string }).userId,
    FDFED: (faculty[3] as { userId: string }).userId,
    // ECE. Both of its faculty own a course, and one of them is also the Mess Warden.
    VLSI: (faculty[4] as { userId: string }).userId,
    SS: (faculty[5] as { userId: string }).userId,
    // AIDS. Gen AI goes to `faculty-8@`, the plain faculty login printed at the bottom of this
    // file, so the one ONGOING reflection is reachable from an advertised sign-in.
    'Gen AI': (faculty[7] as { userId: string }).userId,
    ML: (faculty[9] as { userId: string }).userId,
    // Common to all three branches, anchored at Academics, and so is its reviewee.
    SEED: (faculty[0] as { userId: string }).userId,

    BH1: caretakerBh1.userId,
    BH2: caretakerBh2.userId,
    'Mess A': vendorMessA.userId,
    'Mess B': vendorMessB.userId,
  };

  const subjectId = new Map<string, string>();
  for (const subject of [...COURSES, ...FACILITIES]) {
    const created = await prisma.subject.create({
      data: {
        orgId,
        name: subject.name,
        unitId: unitId.get(subject.unit) as string,
        type: 'general',
        // Left NULL for the two parent-level facilities, and that null is a decision (above).
        linkedUserId: OWNER[subject.name] ?? null,
      },
      select: { id: true },
    });
    subjectId.set(subject.name, created.id);
  }

  const sid = (name: string): string => subjectId.get(name) as string;
  /** Turns a name-keyed comment bank into the id-keyed one `seedResponses` wants. */
  const byId = (bank: Record<string, string[]>): Record<string, string[]> =>
    Object.fromEntries(
      Object.entries(bank)
        .filter(([name]) => subjectId.has(name))
        .map(([name, lines]) => [sid(name), lines]),
    );

  const courseTargets = COURSES.map((course) => ({ id: sid(course.name), quality: course.quality }));

  const studentRoleId = roleId.get('student') as string;
  /** Every student, and only students. The single honest denominator this college has. */
  const allStudents = { kind: 'role', roleId: studentRoleId } as const;
  /** No denominator, and that is the correct answer for a cycle covering many subjects: one
   *  person answers three of them, so a head count would print 300%. */
  const noDenominator = { kind: 'anyone' } as const;

  // 8. Two closed course-feedback cycles. The second is the payoff: FDFED was acted on between
  //    them, so the trend line moves in the direction the comments asked it to.
  const cycles = [
    { name: 'Odd semester course feedback', startedDaysAgo: 205, quality: 1, perSubject: 8 },
    { name: 'Even semester course feedback', startedDaysAgo: 62, quality: 1.35, perSubject: 9 },
  ];
  for (const [index, cycle] of cycles.entries()) {
    const template = templateId.get('Course feedback') as string;
    const startsAt = new Date(Date.now() - cycle.startedDaysAgo * DAY);
    const endsAt = new Date(startsAt.getTime() + 21 * DAY);
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: cycle.name,
        audienceRule: noDenominator,
        access: 'public',
        anonymous: true,
        startsAt,
        endsAt,
        closedAt: endsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: courseTargets.map((target) => ({ subjectId: target.id })) },
      },
      select: { id: true },
    });

    await seedResponses(prisma, {
      rng,
      industry: 'university',
      campaignId: created.id,
      templateId: template,
      // FDFED climbs from 0.34 to a fraction over 0.45 between the two cycles. Everything else
      // moves a little too, because a single subject improving alone reads as a fabrication.
      //
      // SEED gets an explicit count because it is taken by all 30 while a branch course is taken
      // by 10 — left to the shared `perSubject` it would collect the same nine answers as DSA,
      // and a common course with a branch course's turnout is the first thing that would look
      // wrong to anybody who knows the timetable.
      subjects: courseTargets.map((target) => ({
        ...target,
        quality: Math.min(0.9, target.quality * cycle.quality),
        ...(target.id === sid('SEED') ? { count: 22 + index * 3 } : {}),
      })),
      perSubject: cycle.perSubject,
      startsAt,
      endsAt,
      // The written half only goes on the FIRST cycle — the comments are the diagnosis, and
      // repeating them after the fix would say the fix did not happen.
      ...(index === 0 ? { comments: byId(COURSE_COMMENTS) } : {}),
    });
  }

  // 8a. SEED again, on its own, so the common course has a result set of its own size rather
  //     than being one seventh of a cycle. Single subject, so it gets a REAL denominator.
  {
    const template = templateId.get('Course feedback') as string;
    const startsAt = new Date(Date.now() - 58 * DAY);
    const endsAt = new Date(startsAt.getTime() + 14 * DAY);
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: 'SEED — common course review',
        audienceRule: allStudents,
        access: 'public',
        anonymous: true,
        startsAt,
        endsAt,
        closedAt: endsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: [{ subjectId: sid('SEED') }] },
      },
      select: { id: true },
    });
    await seedResponses(prisma, {
      rng,
      industry: 'university',
      campaignId: created.id,
      templateId: template,
      subjects: [{ id: sid('SEED'), quality: 0.77, count: 26 }],
      perSubject: 26,
      startsAt,
      endsAt,
      comments: byId({ SEED: COURSE_COMMENTS['SEED'] as string[] }),
    });
  }

  // 9. The hostel system, reviewed on its own form.
  {
    const template = templateId.get('Hostel review') as string;
    const startsAt = new Date(Date.now() - 40 * DAY);
    const endsAt = new Date(startsAt.getTime() + 14 * DAY);
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: 'Hostel review — BH1 and BH2',
        audienceRule: noDenominator,
        access: 'public',
        anonymous: true,
        startsAt,
        endsAt,
        closedAt: endsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: [{ subjectId: sid('BH1') }, { subjectId: sid('BH2') }] },
      },
      select: { id: true },
    });
    await seedResponses(prisma, {
      rng,
      industry: 'university',
      campaignId: created.id,
      templateId: template,
      subjects: [
        { id: sid('BH1'), quality: 0.41, count: 13 },
        { id: sid('BH2'), quality: 0.63, count: 12 },
      ],
      perSubject: 12,
      startsAt,
      endsAt,
      comments: byId(HOSTEL_REVIEW_COMMENTS),
    });
  }

  // 10. The mess system, on its own form. Mess B is where the numbers and the words agree.
  {
    const template = templateId.get('Mess feedback') as string;
    const startsAt = new Date(Date.now() - 22 * DAY);
    const endsAt = new Date(startsAt.getTime() + 10 * DAY);
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: 'Mess feedback — A and B',
        audienceRule: noDenominator,
        access: 'public',
        anonymous: true,
        startsAt,
        endsAt,
        closedAt: endsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: [{ subjectId: sid('Mess A') }, { subjectId: sid('Mess B') }] },
      },
      select: { id: true },
    });
    await seedResponses(prisma, {
      rng,
      industry: 'university',
      campaignId: created.id,
      templateId: template,
      subjects: [
        { id: sid('Mess A'), quality: 0.62, count: 15 },
        { id: sid('Mess B'), quality: 0.29, count: 11 },
      ],
      perSubject: 13,
      startsAt,
      endsAt,
      comments: byId(MESS_REVIEW_COMMENTS),
    });
  }

  // 11. Three suggestion boxes, all still OPEN, one per system. Every response is scripted and
  //     the counts are exact — the generic pool talks about lecture pacing, which is the wrong
  //     voice entirely inside a hostel's inbox.
  const boxes: Array<{
    name: string;
    startedDaysAgo: number;
    bank: Record<string, string[]>;
  }> = [
    { name: 'Hostel suggestion box', startedDaysAgo: 34, bank: HOSTEL_SUGGESTIONS },
    { name: 'Mess suggestion box', startedDaysAgo: 26, bank: MESS_SUGGESTIONS },
    { name: 'Academics suggestion box', startedDaysAgo: 45, bank: ACADEMIC_SUGGESTIONS },
  ];
  for (const box of boxes) {
    const template = templateId.get('Suggestion box') as string;
    const startsAt = new Date(Date.now() - box.startedDaysAgo * DAY);
    const targets = Object.entries(box.bank).map(([name, lines]) => ({
      id: sid(name),
      quality: 0.5,
      count: lines.length,
    }));
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: box.name,
        audienceRule: noDenominator,
        access: 'public',
        anonymous: true,
        startsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: targets.map((target) => ({ subjectId: target.id })) },
      },
      select: { id: true },
    });
    await seedResponses(prisma, {
      rng,
      industry: 'university',
      campaignId: created.id,
      templateId: template,
      subjects: targets,
      perSubject: 4,
      startsAt,
      endsAt: new Date(),
      comments: byId(box.bank),
    });
  }

  // 12. The polls. Each is ONE question on ONE subject, which is the shape that can carry a real
  //     denominator: 30 students, so the response rate on screen is a fact.
  //
  //     THE VOTES ARE WEIGHTED, not uniform. `seedResponses` picks a `single` option at random,
  //     which is the right default for a form nobody has an opinion about and the wrong one here:
  //     BH1's suggestion box is six sentences about a broken washing machine, and a hostel poll
  //     that then ranks washing machines third says the two screens are unrelated. They are not.
  //     A poll is where a complaint becomes a decision, and the seed has to show that happening.
  const seedPoll = async (poll: {
    question: string;
    options: Array<{ label: string; weight: number }>;
    subject: string;
    startedDaysAgo: number;
    votes: number;
  }): Promise<void> => {
    const labels = poll.options.map((option) => option.label);
    const template = await addTemplate(poll.question, 'Poll', null, [
      {
        kind: 'single',
        text: poll.question,
        config: { kind: 'single', options: labels, allowOther: false },
        required: true,
      },
    ]);
    const question = await prisma.question.findFirstOrThrow({
      where: { templateId: template },
      select: { id: true },
    });

    const startsAt = new Date(Date.now() - poll.startedDaysAgo * DAY);
    const campaign = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: poll.question,
        audienceRule: allStudents,
        access: 'public',
        anonymous: true,
        startsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: [{ subjectId: sid(poll.subject) }] },
      },
      select: { id: true },
    });

    // THE SPLIT IS ALLOCATED, NOT SAMPLED, and that is a correctness fix rather than a
    // preference. Drawing 28 votes against weights of 14 and 8 flips the winner often enough
    // that it did — twice — and because every seed shares one `Rng`, changing any weight
    // ANYWHERE upstream reshuffles every draw downstream. A comment above a poll saying which
    // complaint it confirms would then be true until somebody edited an unrelated line. Largest
    // remainder makes the visible result a fact of the file: what is written is what renders.
    const totalWeight = poll.options.reduce((sum, option) => sum + option.weight, 0);
    const shares = poll.options.map((option) => (poll.votes * option.weight) / totalWeight);
    const counts = shares.map(Math.floor);
    const order = shares
      .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
      .sort((a, b) => b.remainder - a.remainder);
    let left = poll.votes - counts.reduce((sum, count) => sum + count, 0);
    for (const entry of order) {
      if (left <= 0) break;
      counts[entry.index] = (counts[entry.index] as number) + 1;
      left -= 1;
    }

    const responses: Prisma.ResponseCreateManyInput[] = [];
    const answers: Prisma.AnswerCreateManyInput[] = [];
    for (const [index, option] of poll.options.entries()) {
      for (let vote = 0; vote < (counts[index] ?? 0); vote += 1) {
        const id = randomUUID();
        responses.push({
          id,
          campaignId: campaign.id,
          subjectId: sid(poll.subject),
          // Still spread across the window, so the chart is not a single spike — only WHICH
          // option each vote carries is fixed.
          submittedAt: new Date(
            startsAt.getTime() + rng.next() * (Date.now() - startsAt.getTime()),
          ),
          // A poll is the one form people really do answer off a printed code, and fast.
          channel: rng.chance(0.7) ? 'qr' : 'link',
          durationMs: rng.int(4_000, 25_000),
        });
        answers.push({
          responseId: id,
          questionId: question.id,
          value: { kind: 'single', option: option.label },
        });
      }
    }
    await prisma.response.createMany({ data: responses });
    await prisma.answer.createMany({ data: answers });
  };

  const polls: Array<{
    question: string;
    options: Array<{ label: string; weight: number }>;
    subject: string;
    startedDaysAgo: number;
    votes: number;
  }> = [
    {
      // The owner's own: Tuesday's dinner, voted on by everybody who eats in either mess. The
      // weights here are a preference and not a story — nothing else in the organisation depends
      // on which dinner wins, so the top two are left close enough that the draw decides.
      question: "What should Tuesday's dinner be this week?",
      options: [
        { label: 'Chole bhature', weight: 10 },
        { label: 'Veg biryani', weight: 8 },
        { label: 'Masala dosa', weight: 5 },
        { label: 'Pav bhaji', weight: 4 },
      ],
      subject: 'Mess Services',
      startedDaysAgo: 2,
      votes: 27,
    },
    {
      // Straight out of BH1's suggestion box, which is the whole point: a complaint six people
      // wrote separately becomes one question the entire hostel answers, and it wins outright.
      question: 'Which should the hostels fix first?',
      options: [
        { label: 'Washing machines', weight: 14 },
        { label: 'Water pressure', weight: 6 },
        { label: 'Room Wi-Fi', weight: 4 },
        { label: 'Corridor lighting', weight: 1 },
      ],
      subject: 'Hostel Services',
      startedDaysAgo: 6,
      votes: 25,
    },
    {
      question: 'Which elective should run alongside SEED next semester?',
      options: [
        { label: 'Computer Vision', weight: 9 },
        { label: 'Cloud Computing', weight: 7 },
        { label: 'Design Thinking', weight: 5 },
        { label: 'Embedded Systems', weight: 4 },
      ],
      subject: 'SEED',
      startedDaysAgo: 9,
      votes: 24,
    },
    {
      // The other half of the SEED comment about the two evaluations clashing: given the choice,
      // the cohort moves it off the teaching week entirely.
      question: 'When should the FDFED evaluation slots be held?',
      options: [
        { label: 'Saturday morning', weight: 11 },
        { label: 'Weekday evening', weight: 7 },
        { label: 'Weekday morning', weight: 3 },
      ],
      subject: 'FDFED',
      startedDaysAgo: 12,
      votes: 22,
    },
  ];

  for (const poll of polls) await seedPoll(poll);

  // 12a. One institute-wide poll, on the organisation subject the quick-create button uses.
  {
    const orgSubject = await prisma.subject.create({
      data: { orgId, name: IIIT_NAME, type: ORGANISATION_SUBJECT },
      select: { id: true },
    });
    subjectId.set(ORGANISATION_SUBJECT, orgSubject.id);
    // Laundry first and mess food second, which is the order the rest of the organisation is
    // already in: six sentences about washing machines in BH1's inbox, then a hostel poll that
    // ranks them first, then Mess B at 2.0 on its review. An institute-wide poll disagreeing
    // with the two screens beneath it would be the clearest possible sign that each set of
    // numbers was invented without reference to the others.
    await seedPoll({
      question: 'Which should the institute fix first this semester?',
      options: [
        { label: 'Hostel laundry', weight: 14 },
        { label: 'Mess food quality', weight: 8 },
        { label: 'Campus Wi-Fi', weight: 4 },
        { label: 'Lab availability', weight: 2 },
      ],
      subject: ORGANISATION_SUBJECT,
      startedDaysAgo: 4,
      votes: 28,
    });
  }

  // 13. One cycle still collecting and deliberately thin, so k-anonymity suppression can be
  //     watched refusing to render rather than described (INV-005 / 40). Three responses against
  //     a threshold of five: the API sends no per-question data at all, so the client cannot
  //     leak what it was never given.
  {
    const template = templateId.get('Course feedback') as string;
    const startsAt = new Date(Date.now() - 3 * DAY);
    const endsAt = new Date(Date.now() + 11 * DAY);
    const created = await prisma.campaign.create({
      data: {
        orgId,
        templateId: template,
        name: 'Gen AI — mid-course check',
        audienceRule: { kind: 'unit', unitId: unitId.get('aids') as string, includeSubtree: true },
        access: 'public',
        anonymous: true,
        startsAt,
        endsAt,
        createdById: director.userId,
        publicToken: mintToken(),
        subjects: { create: [{ subjectId: sid('Gen AI') }] },
      },
      select: { id: true },
    });
    await seedResponses(prisma, {
      rng,
      industry: 'university',
      campaignId: created.id,
      templateId: template,
      subjects: [{ id: sid('Gen AI'), quality: 0.7, count: 3 }],
      perSubject: 3,
      startsAt,
      endsAt: new Date(),
    });
  }

  // 14. The FDFED evaluation booker: six slots, five places each, and all thirty students in
  //     one of them. A booking carries a name ON PURPOSE — unlike a response it is not
  //     anonymous, because turning up is not feedback (`Booking` in the schema, 44).
  {
    const bookable = await prisma.bookable.create({
      data: {
        orgId,
        name: 'FDFED evaluation — team slots',
        description:
          'Six teams of five. Book the slot your team is presenting in; everyone in the team books the same one.',
        subjectId: sid('FDFED'),
        publicToken: mintToken(),
      },
      select: { id: true },
    });

    // Two days out, on the hour, mornings and afternoons — the shape a real evaluation day has.
    const day = new Date();
    day.setHours(9, 0, 0, 0);
    day.setTime(day.getTime() + 2 * DAY);
    const offsets = [0, 1, 2, 4, 5, 6];

    const slots = await Promise.all(
      offsets.map((offset) =>
        prisma.slot.create({
          data: {
            bookableId: bookable.id,
            startsAt: new Date(day.getTime() + offset * HOUR),
            endsAt: new Date(day.getTime() + offset * HOUR + 45 * 60 * 1000),
            capacity: TEAM_SIZE,
          },
          select: { id: true },
        }),
      ),
    );

    const bookings: Prisma.BookingCreateManyInput[] = [];
    for (let team = 0; team < TEAM_COUNT; team += 1) {
      for (let member = 0; member < TEAM_SIZE; member += 1) {
        const name = studentNames[team * TEAM_SIZE + member] as string;
        bookings.push({
          slotId: slots[team]?.id as string,
          name,
          email: studentEmail(name),
          cancelToken: mintToken(),
        });
      }
    }
    await prisma.booking.createMany({ data: bookings });
  }

  // 15. Enterprise includes announcements, so one is published with real receipts — the headline
  //     number on that screen is a fraction, and a fraction with no denominator is not a number.
  {
    const announcement = await prisma.announcement.create({
      data: {
        orgId,
        title: 'Mess timings change from Monday',
        body: 'Breakfast moves to 07:30–09:30 in both messes. Lunch and dinner are unchanged. The Tuesday dinner poll closes tomorrow.',
        audienceRule: { kind: 'anyone' },
        createdById: director.userId,
        publishedAt: new Date(Date.now() - 2 * DAY),
      },
      select: { id: true },
    });
    await prisma.announcementReceipt.createMany({
      data: staffUserIds.map((userId, index) => ({
        announcementId: announcement.id,
        userId,
        // The Director has not read it, so their own unread banner is on screen at sign-in.
        readAt: index > 0 && index % 3 === 0 ? new Date(Date.now() - DAY) : null,
      })),
      skipDuplicates: true,
    });
  }


  // 16. THE IMPROVE LOOP, AT FOUR DIFFERENT POINTS ALONG IT.
  //
  //     A screen that only ever shows a FINISHED loop teaches nothing about the ordering rule
  //     the feature exists for, so the four below are deliberately at four different states —
  //     `finalised`, `planned`, `reflected` and, by leaving the other cycles alone, `due`.
  //     Three sit on CLOSED rounds and one on a round that is still OPEN, because a reflection
  //     written mid-cycle is the normal case and a product that only supports the post-mortem
  //     would be a different product.
  //
  //     THE ORDERING IS NOT DECORATION. `readGap` 404s until a reflection exists, so the
  //     reviewee's own number is recorded before they can see the one they were given. Seeding
  //     the reflection with a LATER `submittedAt` than the responses would quietly describe the
  //     opposite — somebody marking their own homework — so every `submittedAt` here is after
  //     the round closed only where the round is closed, and mid-window where it is not.
  const campaignRows = await prisma.campaign.findMany({
    where: { orgId },
    select: { id: true, name: true },
  });
  const campaignByName = new Map(campaignRows.map((row) => [row.name, row.id]));
  // Throws rather than skipping: a renamed campaign above must break the seed loudly, not
  // silently produce a college with no reflections in it.
  const cid = (name: string): string => {
    const id = campaignByName.get(name);
    if (!id) throw new Error(`iiit seed: no campaign named ${name}`);
    return id;
  };

  /**
   * A reviewee's own answers, ON THE CAMPAIGN'S OWN INSTRUMENT (INV-008). Self and received have
   * to be the same questions or the gap subtracts two different things.
   *
   * `self` is a FRACTION OF THE SCALE rather than eight hand-written numbers, so the size of the
   * gap is a stated intention — 0.8 against a subject seeded at 0.34 is a blind spot on purpose —
   * and stays that way when a template gains a question.
   */
  const selfAnswers = async (
    template: string,
    self: number,
    line: string,
  ): Promise<Prisma.InputJsonValue> => {
    const questions = await prisma.question.findMany({
      where: { templateId: templateId.get(template) as string },
      orderBy: { position: 'asc' },
      select: { id: true, kind: true, config: true },
    });
    const scaled = (max: number): number => Math.min(max, Math.max(1, Math.round(self * max)));
    return questions.map((question) => {
      const config = question.config as { max?: number; options?: string[] };
      switch (question.kind) {
        case 'rating':
          return { questionId: question.id, value: { kind: 'rating', n: scaled(config.max ?? 5) } };
        case 'nps':
          return { questionId: question.id, value: { kind: 'nps', n: scaled(10) } };
        case 'yesno':
          return { questionId: question.id, value: { kind: 'yesno', yes: self >= 0.6 } };
        case 'single':
          return {
            questionId: question.id,
            value: { kind: 'single', option: (config.options ?? ['—'])[0] as string },
          };
        case 'multi':
          return {
            questionId: question.id,
            value: { kind: 'multi', options: (config.options ?? ['—']).slice(0, 1) },
          };
        default:
          return { questionId: question.id, value: { kind: 'text', text: line } };
      }
    });
  };

  const addReflection = async (spec: {
    campaign: string;
    subject: string;
    template: string;
    author: string;
    self: number;
    line: string;
    daysAgo: number;
    plan?: {
      items: Array<{ text: string; dueAt: null; status: 'open' | 'done' }>;
      finalisedDaysAgo: number | null;
    };
    checkin?: { supervisor: string; notes: string; heldDaysAgo: number | null };
  }): Promise<void> => {
    const reflection = await prisma.reflection.create({
      data: {
        orgId,
        campaignId: cid(spec.campaign),
        subjectId: sid(spec.subject),
        authorUserId: spec.author,
        answers: await selfAnswers(spec.template, spec.self, spec.line),
        submittedAt: new Date(Date.now() - spec.daysAgo * DAY),
      },
      select: { id: true },
    });
    if (!spec.plan) return;

    const plan = await prisma.actionPlan.create({
      data: {
        orgId,
        reflectionId: reflection.id,
        items: spec.plan.items,
        // Immutable once set, and the database enforces it with a trigger rather than trusting
        // the service — so this value is written at creation, never patched afterwards.
        finalisedAt:
          spec.plan.finalisedDaysAgo === null
            ? null
            : new Date(Date.now() - spec.plan.finalisedDaysAgo * DAY),
      },
      select: { id: true },
    });
    if (!spec.checkin) return;

    await prisma.checkin.create({
      data: {
        orgId,
        actionPlanId: plan.id,
        supervisorUserId: spec.checkin.supervisor,
        notes: spec.checkin.notes,
        // A null `heldAt` is a check-in that is BOOKED and has not happened. That is a state the
        // screen has to render, and it only exists in the data if something seeds it.
        heldAt:
          spec.checkin.heldDaysAgo === null
            ? null
            : new Date(Date.now() - spec.checkin.heldDaysAgo * DAY),
      },
    });
  };

  // 16a. FINALISED — and this is the one that explains the rest of the college. FDFED was seeded
  //      at 0.34 in the odd semester and 0.46 in the even one, and until now nothing in the data
  //      said WHY it moved. The reflection is dated two days after the round closed, the plan
  //      answers the comments literally (the rubric, the team size), the HOD held the check-in,
  //      and the next cycle is the result. Self 0.8 against a received 0.34 is the biggest gap
  //      in the organisation, on purpose: that is what "the criteria were never written down"
  //      looks like from the front of the room.
  await addReflection({
    campaign: 'Odd semester course feedback',
    subject: 'FDFED',
    template: 'Course feedback',
    author: (faculty[3] as { userId: string }).userId,
    self: 0.8,
    line: 'The team project is the strongest part of the course and I would keep it as it is.',
    daysAgo: 182,
    plan: {
      items: [
        { text: 'Publish the evaluation rubric in week 1, before the first submission', dueAt: null, status: 'done' },
        { text: 'Cap project teams at four', dueAt: null, status: 'done' },
        { text: 'Rebalance the term: three weeks frontend, three backend', dueAt: null, status: 'open' },
      ],
      finalisedDaysAgo: 176,
    },
    checkin: {
      supervisor: (faculty[1] as { userId: string }).userId,
      notes:
        'Rubric went out in week 1 this term and the teams are at four. Sequencing is the one still open — we will look at it again before the next offering.',
      heldDaysAgo: 150,
    },
  });

  // 16b. PLANNED, NOT FINALISED — the plan is written and the conversation has not happened yet.
  //      The check-in is BOOKED with a null `heldAt`, which is the state between the two.
  await addReflection({
    campaign: 'Mess feedback — A and B',
    subject: 'Mess B',
    template: 'Mess feedback',
    author: vendorMessB.userId,
    self: 0.7,
    line: 'Quality is steady. The second batch at dinner is where we lose time.',
    daysAgo: 10,
    plan: {
      items: [
        { text: 'Serve the second dinner batch from a fresh tray', dueAt: null, status: 'open' },
        { text: 'Move to a two-week dinner rotation', dueAt: null, status: 'open' },
        { text: 'Second clean of the wash area, after lunch', dueAt: null, status: 'open' },
      ],
      finalisedDaysAgo: null,
    },
    checkin: {
      supervisor: (faculty[5] as { userId: string }).userId,
      notes: 'Booked for after the Tuesday dinner poll closes.',
      heldDaysAgo: null,
    },
  });

  // 16c. REFLECTED, AND NOTHING MORE — which is why the hostels ran a poll. The caretaker wrote
  //      their assessment and stopped; six people had already written to the suggestion box about
  //      the same two washing machines, and with no plan on record the complaint had to become a
  //      question the whole hostel answered instead.
  await addReflection({
    campaign: 'Hostel review — BH1 and BH2',
    subject: 'BH1',
    template: 'Hostel review',
    author: caretakerBh1.userId,
    self: 0.6,
    line: 'Cleaning and water are in reasonable shape. Laundry is the one I cannot fix from here.',
    daysAgo: 24,
  });

  // 16d. THE ONGOING ONE, and the only cycle here whose campaign is still collecting. It is also
  //      the k-anonymity case: three responses against a threshold of five, so `readGap` returns
  //      `suppressed: true` and NO rows at all. A reviewee who has recorded their own assessment
  //      and is still shown nothing is the gate doing exactly what INV-005 says it does, and it
  //      cannot be demonstrated on a closed round because every closed round here cleared it.
  await addReflection({
    campaign: 'Gen AI — mid-course check',
    subject: 'Gen AI',
    template: 'Course feedback',
    author: (faculty[7] as { userId: string }).userId,
    self: 0.75,
    line: 'Material is current and the compute quota is the thing I would change first.',
    daysAgo: 1,
  });

  // 17. THE ACTIVITY LOG. `db/tx.ts` writes these rows from a live request, so a freshly seeded
  //     college has an empty one — every other organisation's history happened before the seed
  //     ran, and this one's has to be stated for the same reason its org chart is.
  //
  //     ONLY THE DIRECTOR CAN OPEN THIS SCREEN. `audit.read` is `S('all')` in the grant matrix,
  //     which is level 1 and nobody else, so `readAudit` takes its `visibility.all` branch and
  //     the scope filter never runs. That is worth knowing before reading the rows below: they
  //     are written to be read by one person.
  //
  //     THE TWO DENIALS CARRY NO TARGET, AND THAT IS NOT AN OMISSION. `writeDenial` says it in
  //     as many words — "a refusal names no target row; the actor, action and time are the
  //     security event" — and it writes `targetType: null` for every 403 the product has ever
  //     refused. A seeded denial with a target would be a row the running system cannot produce.
  const auditRows: Array<{
    actor: string;
    action: string;
    targetType?: 'unit' | 'role' | 'subject' | 'campaign' | 'template' | 'person';
    targetId?: string;
    outcome?: 'denied';
    daysAgo: number;
  }> = [
    // The setup, in the order the wizard actually runs it.
    { actor: director.userId, action: 'org.update', targetType: 'unit', targetId: unitId.get('root') as string, daysAgo: 212 },
    { actor: director.userId, action: 'role.create', targetType: 'role', targetId: roleId.get('faculty') as string, daysAgo: 211 },
    { actor: director.userId, action: 'template.create', targetType: 'template', targetId: templateId.get('Hostel review') as string, daysAgo: 210 },
    // The 30 students arrived in one paste, which is what `person.import` is for.
    { actor: director.userId, action: 'person.import', targetType: 'unit', targetId: unitId.get('academics') as string, daysAgo: 209 },
    { actor: (faculty[1] as { userId: string }).userId, action: 'subject.create', targetType: 'subject', targetId: sid('FDFED'), daysAgo: 208 },

    // The odd semester, and the row that follows it is the one 16a acts on.
    { actor: director.userId, action: 'campaign.create', targetType: 'campaign', targetId: cid('Odd semester course feedback'), daysAgo: 206 },
    { actor: director.userId, action: 'campaign.launch', targetType: 'campaign', targetId: cid('Odd semester course feedback'), daysAgo: 205 },
    { actor: (faculty[0] as { userId: string }).userId, action: 'campaign.close', targetType: 'campaign', targetId: cid('Odd semester course feedback'), daysAgo: 184 },
    { actor: (faculty[0] as { userId: string }).userId, action: 'results.export', targetType: 'campaign', targetId: cid('Odd semester course feedback'), daysAgo: 183 },
    { actor: (faculty[1] as { userId: string }).userId, action: 'subject.update', targetType: 'subject', targetId: sid('FDFED'), daysAgo: 180 },

    // The even semester, which is where FDFED's number moves.
    { actor: director.userId, action: 'campaign.create', targetType: 'campaign', targetId: cid('Even semester course feedback'), daysAgo: 63 },
    { actor: director.userId, action: 'campaign.launch', targetType: 'campaign', targetId: cid('Even semester course feedback'), daysAgo: 62 },
    { actor: (faculty[0] as { userId: string }).userId, action: 'campaign.close', targetType: 'campaign', targetId: cid('Even semester course feedback'), daysAgo: 41 },

    // The hostels. Dates match the campaign's own window: opened 40 days ago, closed 26.
    { actor: (faculty[2] as { userId: string }).userId, action: 'campaign.create', targetType: 'campaign', targetId: cid('Hostel review — BH1 and BH2'), daysAgo: 41 },
    { actor: (faculty[2] as { userId: string }).userId, action: 'campaign.launch', targetType: 'campaign', targetId: cid('Hostel review — BH1 and BH2'), daysAgo: 40 },
    { actor: (faculty[2] as { userId: string }).userId, action: 'campaign.close', targetType: 'campaign', targetId: cid('Hostel review — BH1 and BH2'), daysAgo: 26 },

    // DENIAL ONE, and it is the scope working rather than a bug: BH1's caretaker holds
    // `results.read` at `own_unit`, and Mess B is not their unit. Somebody who has just read six
    // complaints about the food going looking for the mess numbers is the most ordinary 403 there is.
    { actor: caretakerBh1.userId, action: 'results.read', outcome: 'denied', daysAgo: 33 },

    // The messes, on the same rule: opened 22 days ago, closed 12.
    { actor: (faculty[5] as { userId: string }).userId, action: 'campaign.create', targetType: 'campaign', targetId: cid('Mess feedback — A and B'), daysAgo: 23 },
    { actor: (faculty[5] as { userId: string }).userId, action: 'campaign.launch', targetType: 'campaign', targetId: cid('Mess feedback — A and B'), daysAgo: 22 },
    { actor: (faculty[5] as { userId: string }).userId, action: 'campaign.close', targetType: 'campaign', targetId: cid('Mess feedback — A and B'), daysAgo: 12 },

    // DENIAL TWO. Mess B closed at 2.0 and its vendor manager tried to archive the subject the
    // numbers are attached to; `subject.archive` stops at level 2, so it does not reach them.
    // A log that could not show this is a log that answers half the question an administrator asks.
    { actor: vendorMessB.userId, action: 'subject.archive', outcome: 'denied', daysAgo: 11 },

    // The last fortnight, the part somebody scrolling the screen sees first.
    { actor: (faculty[6] as { userId: string }).userId, action: 'campaign.create', targetType: 'campaign', targetId: cid('Gen AI — mid-course check'), daysAgo: 3 },
    { actor: (faculty[6] as { userId: string }).userId, action: 'campaign.launch', targetType: 'campaign', targetId: cid('Gen AI — mid-course check'), daysAgo: 3 },
    { actor: director.userId, action: 'person.update', targetType: 'person', targetId: studentUserIds[0] as string, daysAgo: 2 },
    { actor: director.userId, action: 'campaign.create', targetType: 'campaign', targetId: cid('Which should the institute fix first this semester?'), daysAgo: 4 },
    { actor: director.userId, action: 'campaign.launch', targetType: 'campaign', targetId: cid('Which should the institute fix first this semester?'), daysAgo: 4 },
  ];

  await prisma.auditLog.createMany({
    data: auditRows.map((row) => ({
      orgId,
      actorUserId: row.actor,
      action: row.action,
      targetType: row.targetType ?? null,
      targetId: row.targetId ?? null,
      outcome: row.outcome ?? 'allowed',
      // WHICH grant decided it (INV-007), and on a refusal it is the most useful field there is:
      // the narrowest deny that stopped it, which is the answer to "whom do I ask".
      ...(row.outcome === 'denied'
        ? { decidedBy: { via: 'default', effect: 'deny' } }
        : {}),
      requestId: null,
      // No `ip`. The read path allow-lists six columns and deliberately excludes it, so seeding
      // one would store something no screen can ever show.
      createdAt: new Date(Date.now() - row.daysAgo * DAY),
    })),
  });

  // The logins worth printing: one per distinct VIEW of this organisation. Signing in as the
  // CSE HOD and then as the BH1 caretaker is the fastest proof that `requireCapability` is doing
  // the work and the UI is only rendering what it was handed (INV-003).
  const push = (role: string, email: string): void => {
    logins.push({ org: IIIT_NAME, email, password, role });
  };
  push('Director', `admin@${IIIT_SLUG}.endur.test`);
  push('Dean', `dean@${IIIT_SLUG}.endur.test`);
  push('HOD — CSE', `hod.cse@${IIIT_SLUG}.endur.test`);
  push('HOD — ECE', `hod.ece@${IIIT_SLUG}.endur.test`);
  push('HOD — AIDS', `hod.aids@${IIIT_SLUG}.endur.test`);
  push('Chief Warden', `chief.warden@${IIIT_SLUG}.endur.test`);
  push('Hostel Caretaker — BH1', `caretaker.bh1@${IIIT_SLUG}.endur.test`);
  push('Mess Warden', `mess.warden@${IIIT_SLUG}.endur.test`);
  push('Vendor Manager — Mess B', `vendor.mess-b@${IIIT_SLUG}.endur.test`);
  push('Faculty', `faculty-8@${IIIT_SLUG}.endur.test`);

  return logins;
}
