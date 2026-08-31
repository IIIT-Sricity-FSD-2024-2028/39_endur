// Templates and their questions.
// A template belongs to the whole organisation and to no unit, which is why nothing here filters by unit.
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
import { counted, nounsOf } from '../../lib/vocabulary.js';
import { afterCursor, CURSOR_ORDER, pageOf, type Paged } from '../../lib/paginate.js';

// The shared library: rows with no organisation. One copy for everybody, cloned on demand rather than duplicated at signup.
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

// This organisation's own templates.
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

// One template with its questions, from the org or from the shared library.
export async function readTemplate(orgId: string, templateId: string): Promise<TemplateDetail> {
  const template = await prisma.template.findFirst({
    // A library template is readable by every org; an org's own template only by that org.
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

// Creates an empty template.
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
        // Derived from the questions, and a new template has none. Never taken from the request,
        // so a template cannot claim to be shorter than it is.
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

// Renames a template or edits its description.
export async function updateTemplate(
  req: Request,
  orgId: string,
  templateId: string,
  body: UpdateTemplateBody,
): Promise<TemplateDetail> {
  await assertOwned(orgId, templateId);
  await assertEditable(req, templateId);

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

// Copies a template into this organisation. The source id is recorded, so "23 orgs use a variant of this" needs no extra table.
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

// Replaces the whole question set in one transaction.
// The builder saves a document, not one field at a time, and each question's position comes from its
// place in the array, never from the client.
export async function putQuestions(
  req: Request,
  orgId: string,
  templateId: string,
  body: PutQuestionsBody,
): Promise<TemplateDetail> {
  await assertOwned(orgId, templateId);
  await assertEditable(req, templateId);

  for (const question of body.questions) {
    // The config must match the question's own kind, or the form would store a shape the renderer cannot read.
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

// Deletes a template, unless a campaign already uses it.
export async function deleteTemplate(
  req: Request,
  orgId: string,
  templateId: string,
): Promise<{ ok: true }> {
  await assertOwned(orgId, templateId);

  const inUse = await prisma.campaign.count({ where: { templateId } });
  if (inUse > 0) {
    // Deleting would leave every collected answer pointing at nothing, so a template in use is a 409, not a soft delete.
    throw new ConflictError(
      `That template is used by ${counted(inUse, nounsOf(req).campaign).toLowerCase()}. Delete or close those first.`,
    );
  }

  await runInTransaction(req, async (tx) => {
    await tx.template.delete({ where: { id: templateId } });
    req.ctx.audit.push({ action: 'template.delete', targetType: 'template', targetId: templateId });
  });
  return { ok: true };
}

// Helpers.

// Throws unless this template belongs to this organisation.
async function assertOwned(orgId: string, templateId: string): Promise<void> {
  const template = await prisma.template.findFirst({
    where: { id: templateId, orgId },
    select: { id: true },
  });
  // A library template is readable by everyone and writable by nobody, and 404 keeps that one rule instead of two.
  if (!template) throw new NotFoundError('That template does not exist.');
}

// A template used by a launched campaign is read-only: editing it would mean half the respondents
// answered a different form. The builder offers "duplicate to edit" instead.
async function isLocked(templateId: string): Promise<boolean> {
  const launched = await prisma.campaign.count({
    where: { templateId, NOT: { publicToken: null } },
  });
  return launched > 0;
}

// Throws when the template is locked by a launched campaign.
async function assertEditable(req: Request, templateId: string): Promise<void> {
  if (await isLocked(templateId)) {
    throw new ConflictError(
      `That template is in use by a ${nounsOf(req).campaign.one.toLowerCase()} that has launched. Duplicate it to make changes.`,
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
  // Both counts come back with the row, so a 20-card library is one request rather than 21.
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

// Turns a template row into the summary shape the client reads.
function toSummary(template: TemplateRow): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    industry: template.industry,
    // Both derived: a stored question count would drift the moment somebody edited the form.
    questionCount: template._count.questions,
    estimatedSeconds: template.estimatedSeconds,
    campaignCount: template._count.campaigns,
    isLibrary: template.orgId === null,
    clonedFromId: template.clonedFromId,
    createdAt: template.createdAt.toISOString(),
  };
}

export type { QuestionInput };
