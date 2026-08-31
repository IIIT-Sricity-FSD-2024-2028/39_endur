// The improve loop.
// The ORDERING is the feature: the reviewee records their own assessment BEFORE seeing what anyone
// else said, or the reflection just becomes a rationalisation of the scores and the gap means nothing.
// That is enforced here, not in the UI - the gap 404s until a reflection exists, and no route returns
// the received scores alone.
// Two surfaces, two scopes: the reflection, gap and plan are the reviewee's OWN, decided by the subject
// being linked to their account; check-ins are the supervisor's, and their reach is the resolver's.
import type {
  AnswerValue,
  CheckinBody,
  CheckinPatchBody,
  CreatePlanBody,
  GapRow,
  GapView,
  PlanItem,
  PlanView,
  ReflectState,
  ReflectionCycle,
  ReflectionForm,
  SubmitReflectionBody,
} from '@endur/shared';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { visibleUnits } from '../../authz/index.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';

// The same error envelope for a check a schema cannot make: comparing an answer against its own question row.
const fieldError = (message: string): AppError =>
  new AppError('VALIDATION_FAILED', 'Some fields need attention.', {
    fields: [{ path: 'body.answers', message }],
  });

// The subjects this caller IS: 'self' in the only form that means anything here.
async function mySubjects(orgId: string, userId: string) {
  return prisma.subject.findMany({
    where: { orgId, linkedUserId: userId, archivedAt: null },
    select: { id: true, name: true, unitId: true },
  });
}

// Every cycle this person is a reviewee in, with its state.
export async function readCycles(orgId: string, userId: string): Promise<ReflectionCycle[]> {
  const subjects = await mySubjects(orgId, userId);
  if (subjects.length === 0) return [];
  const subjectIds = subjects.map((subject) => subject.id);

  const links = await prisma.campaignSubject.findMany({
    where: { subjectId: { in: subjectIds }, campaign: { orgId } },
    select: {
      subjectId: true,
      campaign: {
        select: { id: true, name: true, endsAt: true, closedAt: true, publicToken: true },
      },
    },
  });
  // Draft campaigns are not cycles: nothing has been asked of anybody yet.
  const live = links.filter((link) => link.campaign.publicToken !== null);
  if (live.length === 0) return [];

  const reflections = await prisma.reflection.findMany({
    where: {
      subjectId: { in: subjectIds },
      campaignId: { in: live.map((link) => link.campaign.id) },
    },
    select: {
      campaignId: true, subjectId: true, submittedAt: true,
      plan: { select: { id: true, finalisedAt: true } },
    },
  });
  const key = (campaignId: string, subjectId: string) => `${campaignId}:${subjectId}`;
  const byKey = new Map(reflections.map((row) => [key(row.campaignId, row.subjectId), row]));
  const nameOf = new Map(subjects.map((subject) => [subject.id, subject.name]));

  return live
    .map((link) => {
      const reflection = byKey.get(key(link.campaign.id, link.subjectId));
      const status: ReflectState = !reflection
        ? 'due'
        : reflection.plan?.finalisedAt
          ? 'finalised'
          : reflection.plan
            ? 'planned'
            : 'reflected';
      return {
        campaignId: link.campaign.id,
        campaignName: link.campaign.name,
        subjectId: link.subjectId,
        subjectName: nameOf.get(link.subjectId) ?? '',
        status,
        endsAt: link.campaign.endsAt?.toISOString() ?? null,
        closed: link.campaign.closedAt !== null,
        reflectedAt: reflection?.submittedAt.toISOString() ?? null,
        planId: reflection?.plan?.id ?? null,
        planFinalisedAt: reflection?.plan?.finalisedAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (a.status === 'due' ? -1 : 0) - (b.status === 'due' ? -1 : 0));
}

// The campaign's OWN questions, unchanged: self and received have to be the same instrument,
// or the gap arithmetic compares two different things.
export async function readForm(
  orgId: string,
  userId: string,
  campaignId: string,
): Promise<ReflectionForm> {
  const { campaign, subject } = await myCycle(orgId, userId, campaignId);

  const questions = await prisma.question.findMany({
    where: { templateId: campaign.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, text: true, config: true, required: true, position: true },
  });
  const existing = await prisma.reflection.findUnique({
    where: { campaignId_subjectId: { campaignId, subjectId: subject.id } },
    select: { answers: true },
  });

  return {
    campaignId,
    campaignName: campaign.name,
    subjectId: subject.id,
    subjectName: subject.name,
    questions: questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      text: question.text,
      config: question.config,
      required: question.required,
      position: question.position,
    })),
    answers: existing ? (existing.answers as ReflectionForm['answers']) : null,
  };
}

// Records the reviewee's own answers for a cycle.
export async function submitReflection(
  orgId: string,
  userId: string,
  campaignId: string,
  body: SubmitReflectionBody,
): Promise<{ id: string }> {
  const { campaign, subject } = await myCycle(orgId, userId, campaignId);
  if (subject.id !== body.subjectId) {
    // The body names a subject, but the caller's own link decides which one is legal.
    throw new ForbiddenError('That is not your own review.');
  }

  const questions = await prisma.question.findMany({
    where: { templateId: campaign.templateId },
    select: { id: true, required: true },
  });
  const answered = new Set(body.answers.map((answer) => answer.questionId));
  const known = new Set(questions.map((question) => question.id));
  if (body.answers.some((answer) => !known.has(answer.questionId))) {
    throw fieldError('That question is not in this form.');
  }
  const missing = questions.filter((question) => question.required && !answered.has(question.id));
  if (missing.length > 0) {
    throw fieldError('Answer every required question.');
  }

  try {
    const created = await prisma.reflection.create({
      data: {
        orgId,
        campaignId,
        subjectId: subject.id,
        authorUserId: userId,
        answers: body.answers,
        submittedAt: new Date(),
      },
      select: { id: true },
    });
    return created;
  } catch {
    // The unique index refusing a rewrite after the fact, which is the mechanism working, not a bug.
    throw new ConflictError('You have already recorded your assessment for this cycle.');
  }
}

// The gap: their own answers beside the averages they received.
export async function readGap(
  orgId: string,
  userId: string,
  campaignId: string,
): Promise<GapView> {
  const { campaign, subject } = await myCycle(orgId, userId, campaignId);

  const reflection = await prisma.reflection.findUnique({
    where: { campaignId_subjectId: { campaignId, subjectId: subject.id } },
    select: {
      id: true, answers: true, submittedAt: true,
      plan: {
        select: {
          id: true, items: true, finalisedAt: true,
          checkins: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true, notes: true, heldAt: true, finalisedAt: true,
              supervisor: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  // The ordering constraint, as a 404 rather than a 403: there is nothing here YET, which is different
  // from something being withheld. It becomes readable the moment they write their own.
  if (!reflection) throw new NotFoundError();

  const responseWhere = { campaignId, subjectId: subject.id };
  const responseCount = await prisma.response.count({ where: responseWhere });
  const threshold = config.K_ANON_THRESHOLD;

  const plan: PlanView | null = reflection.plan
    ? {
        id: reflection.plan.id,
        items: reflection.plan.items as PlanItem[],
        finalisedAt: reflection.plan.finalisedAt?.toISOString() ?? null,
        checkins: reflection.plan.checkins.map((checkin) => ({
          id: checkin.id,
          supervisorName: checkin.supervisor.name,
          notes: checkin.notes,
          heldAt: checkin.heldAt?.toISOString() ?? null,
          finalisedAt: checkin.finalisedAt?.toISOString() ?? null,
        })),
      }
    : null;

  const head = {
    campaignId,
    campaignName: campaign.name,
    subjectId: subject.id,
    subjectName: subject.name,
    reflectedAt: reflection.submittedAt.toISOString(),
    threshold,
    responseCount,
    plan,
  };

  // The same anonymity gate as the results page: below the threshold there are no rows at all, because
  // a reviewee with three responses reading an average can work out who said what.
  if (responseCount < threshold) return { ...head, suppressed: true };

  const questions = await prisma.question.findMany({
    where: { templateId: campaign.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, text: true, config: true },
  });
  const selfAnswers = new Map(
    (reflection.answers as Array<{ questionId: string; value: AnswerValue }>).map((answer) => [
      answer.questionId,
      answer.value,
    ]),
  );
  const averages = await prisma.answer.groupBy({
    by: ['questionId'],
    where: { response: responseWhere, numericValue: { not: null } },
    _avg: { numericValue: true },
  });
  const receivedOf = new Map(
    averages.map((row) => [row.questionId, row._avg.numericValue?.toNumber() ?? null]),
  );

  const rows: GapRow[] = questions.map((question) => {
    const self = numeric(selfAnswers.get(question.id));
    const received = receivedOf.get(question.id) ?? null;
    return {
      questionId: question.id,
      text: question.text,
      self,
      received: received === null ? null : Math.round(received * 100) / 100,
      // Both halves or neither: a difference measured against a missing half is a number about nothing.
      delta:
        self === null || received === null ? null : Math.round((self - received) * 100) / 100,
      scaleMax: scaleMaxOf(question.kind, question.config),
    };
  });

  return { ...head, suppressed: false, rows };
}

// Creates or updates the action plan for a cycle.
export async function createPlan(
  orgId: string,
  userId: string,
  campaignId: string,
  body: CreatePlanBody,
): Promise<PlanView> {
  const { subject } = await myCycle(orgId, userId, campaignId);
  const reflection = await prisma.reflection.findUnique({
    where: { campaignId_subjectId: { campaignId, subjectId: subject.id } },
    select: { id: true, plan: { select: { id: true, finalisedAt: true } } },
  });
  // A plan is step 3 and follows step 2: writing one first would be planning against results you have not seen.
  if (!reflection) throw new NotFoundError();
  if (reflection.plan?.finalisedAt) {
    throw new ConflictError('That plan is finalised and cannot be changed.');
  }

  const saved = reflection.plan
    ? await prisma.actionPlan.update({
        where: { id: reflection.plan.id },
        data: { items: body.items },
        select: { id: true, items: true, finalisedAt: true },
      })
    : await prisma.actionPlan.create({
        data: { orgId, reflectionId: reflection.id, items: body.items },
        select: { id: true, items: true, finalisedAt: true },
      });

  return {
    id: saved.id,
    items: saved.items as PlanItem[],
    finalisedAt: saved.finalisedAt?.toISOString() ?? null,
    checkins: [],
  };
}

// Marks an action plan final, so it stops changing.
export async function finalisePlan(
  orgId: string,
  userId: string,
  planId: string,
): Promise<{ finalisedAt: string }> {
  const plan = await prisma.actionPlan.findFirst({
    where: { id: planId, orgId },
    select: { id: true, finalisedAt: true, reflection: { select: { authorUserId: true } } },
  });
  if (!plan || plan.reflection.authorUserId !== userId) throw new NotFoundError();
  if (plan.finalisedAt) throw new ConflictError('That plan is already finalised.');

  const updated = await prisma.actionPlan.update({
    where: { id: planId },
    data: { finalisedAt: new Date() },
    select: { finalisedAt: true },
  });
  return { finalisedAt: (updated.finalisedAt as Date).toISOString() };
}

// The supervisor's side.

// A check-in is the one surface here that reaches past the caller's own row, so its reach comes from
// the resolver rather than a hand-written subtree walk.
async function assertSupervises(
  orgId: string,
  userId: string,
  authzVersion: number,
  planId: string,
): Promise<{ id: string }> {
  const plan = await prisma.actionPlan.findFirst({
    where: { id: planId, orgId },
    select: { id: true, reflection: { select: { subject: { select: { unitId: true } } } } },
  });
  if (!plan) throw new NotFoundError();

  const visibility = await visibleUnits({
    orgId, userId, capability: 'checkin.create', authzVersion,
  });
  if (visibility.all) return { id: plan.id };
  const unitId = plan.reflection.subject.unitId;
  if (unitId && visibility.unitIds.includes(unitId)) return { id: plan.id };
  // 404, not 403: a plan outside the caller's scope must not be confirmed to exist.
  throw new NotFoundError();
}

// Records a supervisor's check-in against a plan.
export async function createCheckin(
  orgId: string,
  userId: string,
  authzVersion: number,
  body: CheckinBody,
): Promise<{ id: string }> {
  await assertSupervises(orgId, userId, authzVersion, body.actionPlanId);
  return prisma.checkin.create({
    data: {
      orgId,
      actionPlanId: body.actionPlanId,
      supervisorUserId: userId,
      notes: body.notes ?? null,
      heldAt: body.heldAt ? new Date(body.heldAt) : null,
    },
    select: { id: true },
  });
}

// Edits or finalises an existing check-in.
export async function patchCheckin(
  orgId: string,
  userId: string,
  authzVersion: number,
  id: string,
  body: CheckinPatchBody,
): Promise<{ id: string; finalisedAt: string | null }> {
  const checkin = await prisma.checkin.findFirst({
    where: { id, orgId },
    select: { id: true, actionPlanId: true, finalisedAt: true },
  });
  if (!checkin) throw new NotFoundError();
  await assertSupervises(orgId, userId, authzVersion, checkin.actionPlanId);
  // The database refuses this too, but checking here turns a raised exception into a 409 with a sentence.
  if (checkin.finalisedAt) throw new ConflictError('That check-in is finalised.');

  const updated = await prisma.checkin.update({
    where: { id },
    data: {
      ...(body.notes === undefined ? {} : { notes: body.notes }),
      ...(body.heldAt === undefined ? {} : { heldAt: new Date(body.heldAt) }),
      ...(body.finalise ? { finalisedAt: new Date() } : {}),
    },
    select: { id: true, finalisedAt: true },
  });
  return { id: updated.id, finalisedAt: updated.finalisedAt?.toISOString() ?? null };
}

// Helpers.

// The campaign and the caller's OWN subject in it, or 404. The self gate, in one place.
async function myCycle(orgId: string, userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    select: { id: true, name: true, templateId: true, publicToken: true },
  });
  if (!campaign || campaign.publicToken === null) throw new NotFoundError();

  const link = await prisma.campaignSubject.findFirst({
    where: { campaignId, subject: { orgId, linkedUserId: userId, archivedAt: null } },
    select: { subject: { select: { id: true, name: true, unitId: true } } },
  });
  // Not a 403: somebody who is not a reviewee in this cycle has no business knowing it exists.
  if (!link) throw new NotFoundError();
  return { campaign, subject: link.subject };
}

// The comparable half of an answer. Text and multi-select have no number and say so rather than pretending.
function numeric(value: AnswerValue | undefined): number | null {
  if (!value) return null;
  switch (value.kind) {
    case 'rating':
    case 'nps':
      return value.n;
    case 'yesno':
      return value.yes ? 1 : 0;
    default:
      return null;
  }
}

// The top of a rating scale for one question, used to normalise the numbers.
function scaleMaxOf(kind: string, questionConfig: unknown): number | null {
  if (kind === 'nps') return 10;
  if (kind === 'yesno') return 1;
  if (kind === 'rating') {
    const max = (questionConfig as { max?: number } | null)?.max;
    return typeof max === 'number' ? max : 5;
  }
  return null;
}
