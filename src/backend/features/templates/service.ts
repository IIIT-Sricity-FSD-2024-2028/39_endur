// Templates and their questions. 13 § Templates, 36, 37, DEC-010.
//
// Templates are org-wide artefacts with no unit, which is why the seeded matrix gives
// `template.*` the `all` scope: scope is about the org graph, and templates are not in it
// (50 §1). That one line explains most of what looks unusual in this file — there is no
// unit filtering here, because there is no unit to filter on.
import { estimateSeconds } from '@endur/shared';
import type {
  CreateTemplateBody,
  PutQuestionsBody,
  QuestionConfig,
  QuestionInput,
  TemplateDetail,
  TemplateSummary,
  UpdateTemplateBody,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';

/**
 * The shared library: `orgId IS NULL` (10 §4.2). One copy for everybody, cloned into an
 * organisation on demand rather than duplicated into every org at signup.
 */
export async function listLibrary(filters: {
  industry?: string;
  category?: string;
}): Promise<TemplateSummary[]> {
  const templates = await prisma.template.findMany({
    where: {
      orgId: null,
      ...(filters.industry ? { industry: filters.industry } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    orderBy: [{ industry: 'asc' }, { name: 'asc' }],
    select: templateSelect,
  });
  return templates.map(toSummary);
}

export async function listTemplates(
  orgId: string,
  query: { cursor?: string; limit: number; q?: string },
): Promise<Paged<TemplateSummary>> {
  const where = {
    orgId,
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.template.findMany({
      where: { ...where, ...afterCursor(query.cursor) },
      take: query.limit + 1,
      orderBy: CURSOR_ORDER,
      select: templateSelect,
    }),
    prisma.template.count({ where }),
  ]);
  return pageOf(rows, query.limit, total, toSummary);
}

export async function readTemplate(orgId: string, templateId: string): Promise<TemplateDetail> {
  const template = await prisma.template.findFirst({
    // A library template (orgId null) is readable by every org; an org's own template is
    // readable only by that org. Both cases in one where clause, because "or it is in the
    // library" is genuinely part of the visibility rule here.
    where: { id: templateId, OR: [{ orgId }, { orgId: null }] },
    select: { ...templateSelect, questions: { orderBy: { position: 'asc' }, select: questionSelect } },
  });
  if (!template) throw new NotFoundError('That template does not exist.');

  return {
    ...toSummary(template),
    readOnly: await isLocked(templateId),
    questions: template.questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      text: question.text,
      config: question.config as QuestionConfig,
      required: question.required,
      position: question.position,
    })),
  };
}

export async function createTemplate(
  req: Request,
  orgId: string,
  body: CreateTemplateBody,
): Promise<TemplateDetail> {
  return runInTransaction(req, async (tx) => {
    const template = await tx.template.create({
      data: {
        orgId,
        name: body.name,
        category: body.category,
        description: body.description ?? null,
        // Derived from the questions, and a blank template has none. Never accepted as
        // input: a template must not be able to claim it is shorter than it is (36).
        estimatedSeconds: 0,
      },
      select: templateSelect,
    });
    req.ctx.audit.push({
      action: 'template.create',
      targetType: 'template',
      targetId: template.id,
    });
    return { ...toSummary(template), readOnly: false, questions: [] };
  });
}

export async function updateTemplate(
  req: Request,
  orgId: string,
  templateId: string,
  body: UpdateTemplateBody,
): Promise<TemplateDetail> {
  await assertOwned(orgId, templateId);
  await assertEditable(templateId);

  return runInTransaction(req, async (tx) => {
    await tx.template.update({
      where: { id: templateId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });
    req.ctx.audit.push({ action: 'template.update', targetType: 'template', targetId: templateId });
    return readTemplate(orgId, templateId);
  });
}

/**
 * Clone a library template — or one of the org's own — into this organisation.
 *
 * `cloned_from_id` is recorded (10 §4.2), which is what later lets us say "23 orgs use a
 * variant of this template" without keeping a separate usage table.
 */
export async function cloneTemplate(
  req: Request,
  orgId: string,
  templateId: string,
  name?: string,
): Promise<TemplateDetail> {
  const source = await prisma.template.findFirst({
    where: { id: templateId, OR: [{ orgId }, { orgId: null }] },
    select: {
      name: true,
      category: true,
      industry: true,
      description: true,
      questions: { orderBy: { position: 'asc' }, select: questionSelect },
    },
  });
  if (!source) throw new NotFoundError('That template does not exist.');

  const created = await runInTransaction(req, async (tx) => {
    const template = await tx.template.create({
      data: {
        orgId,
        name: name ?? source.name,
        category: source.category,
        industry: source.industry,
        description: source.description,
        clonedFromId: templateId,
        estimatedSeconds: estimateSeconds(source.questions.map((q) => q.kind)),
        questions: {
          create: source.questions.map((question, index) => ({
            kind: question.kind,
            text: question.text,
            config: question.config as never,
            required: question.required,
            position: index,
          })),
        },
      },
      select: { id: true },
    });
    req.ctx.audit.push({
      action: 'template.clone',
      targetType: 'template',
      targetId: template.id,
    });
    return template.id;
  });

  return readTemplate(orgId, created);
}

/**
 * The whole question set, replaced in one transaction (13 §3, 37).
 *
 * The builder autosaves a DOCUMENT, not a stream of field edits, and reordering is one
 * operation on an array rather than N position updates. `position` is derived from array
 * index and is never sent — the deferrable unique on (template_id, position) is what lets
 * the whole set be rewritten inside a single transaction without shuffling through
 * temporary values (10 §4.2).
 */
export async function putQuestions(
  req: Request,
  orgId: string,
  templateId: string,
  body: PutQuestionsBody,
): Promise<TemplateDetail> {
  await assertOwned(orgId, templateId);
  await assertEditable(templateId);

  for (const question of body.questions) {
    // The config union is discriminated on `kind`, and a mismatch would store a shape the
    // renderer cannot read. Zod checks the config's own shape; this checks that it belongs
    // to the question it is attached to (14 §4).
    if (question.config.kind !== question.kind) {
      throw new ConflictError(
        `A ${question.kind} question cannot carry a ${question.config.kind} configuration.`,
      );
    }
  }

  await runInTransaction(req, async (tx) => {
    await tx.question.deleteMany({ where: { templateId } });
    for (const [index, question] of body.questions.entries()) {
      await tx.question.create({
        data: {
          templateId,
          kind: question.kind,
          text: question.text,
          config: question.config as never,
          required: question.required,
          position: index,
        },
      });
    }
    await tx.template.update({
      where: { id: templateId },
      data: {
        estimatedSeconds: estimateSeconds(body.questions.map((question) => question.kind)),
      },
    });
    req.ctx.audit.push({ action: 'template.update', targetType: 'template', targetId: templateId });
  });

  return readTemplate(orgId, templateId);
}

export async function deleteTemplate(
  req: Request,
  orgId: string,
  templateId: string,
): Promise<{ ok: true }> {
  await assertOwned(orgId, templateId);

  const inUse = await prisma.campaign.count({ where: { templateId } });
  if (inUse > 0) {
    // Deleting would cascade the questions away and leave every collected answer pointing
    // at nothing. The campaign's history is the reason this is a 409 and not a soft delete.
    throw new ConflictError(
      `That template is used by ${inUse} campaign${inUse === 1 ? '' : 's'}. Delete or close those first.`,
    );
  }

  await runInTransaction(req, async (tx) => {
    await tx.template.delete({ where: { id: templateId } });
    req.ctx.audit.push({ action: 'template.delete', targetType: 'template', targetId: templateId });
  });
  return { ok: true };
}

/* ---------------------------------------------------------------- helpers */

async function assertOwned(orgId: string, templateId: string): Promise<void> {
  const template = await prisma.template.findFirst({
    where: { id: templateId, orgId },
    select: { id: true },
  });
  // A library template is readable by everyone and writable by nobody. Answering 404 keeps
  // that one rule instead of two.
  if (!template) throw new NotFoundError('That template does not exist.');
}

/**
 * A template used by a LAUNCHED campaign is read-only.
 *
 * Editing questions under a running campaign would invalidate the responses already
 * collected — half the respondents answered a different form. The builder shows a banner
 * with `Duplicate to edit` rather than silently disabling controls (37).
 */
async function isLocked(templateId: string): Promise<boolean> {
  const launched = await prisma.campaign.count({
    where: { templateId, NOT: { publicToken: null } },
  });
  return launched > 0;
}

async function assertEditable(templateId: string): Promise<void> {
  if (await isLocked(templateId)) {
    throw new ConflictError(
      'That template is in use by a campaign that has launched. Duplicate it to make changes.',
    );
  }
}

const templateSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  industry: true,
  orgId: true,
  clonedFromId: true,
  estimatedSeconds: true,
  createdAt: true,
  // Both counts in the same query as the row. `campaignCount` is what the delete dialog
  // states before it is pressed, and fetching it per card would turn a 20-card library
  // into 21 requests (36).
  _count: { select: { questions: true, campaigns: true } },
};

const questionSelect = {
  id: true,
  kind: true,
  text: true,
  config: true,
  required: true,
  position: true,
};

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  industry: string | null;
  orgId: string | null;
  clonedFromId: string | null;
  estimatedSeconds: number;
  createdAt: Date;
  _count: { questions: number; campaigns: number };
};

function toSummary(template: TemplateRow): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    industry: template.industry,
    // Both DERIVED. A card that showed a hand-entered question count would drift from the
    // form the moment anyone edited it (36).
    questionCount: template._count.questions,
    estimatedSeconds: template.estimatedSeconds,
    campaignCount: template._count.campaigns,
    isLibrary: template.orgId === null,
    clonedFromId: template.clonedFromId,
    createdAt: template.createdAt.toISOString(),
  };
}

export type { QuestionInput };
