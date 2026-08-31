// The respondent surface: reading a public form and submitting answers.
// Two rules run through the whole file: the payload is built from an explicit allowlist, because anyone
// with a link reaches it; and every reason a token fails produces the SAME 404.
import { resolveLabels } from '@endur/shared';
import type {
  CampaignAccess,
  LabelSet,
  PublicCampaign,
  QuestionConfig,
  SubmitResponseBody,
  SubmitResult,
} from '@endur/shared';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { runInTransaction } from '../../db/tx.js';
import { ConflictError, ValidationError } from '../../lib/errors.js';
import { uniform404, type LiveCampaign } from './resolve.js';
import { z } from 'zod';

// The allowlist. Every key here was added deliberately; nothing arrives just because a row carried it.
// The campaign was already resolved and gated, so this function only maps.
export function readPublicCampaign(campaign: LiveCampaign): PublicCampaign {
  return {
    campaignName: campaign.name,
    organizationName: campaign.org.name,
    labels: resolveLabels(campaign.org.labels as LabelSet),
    anonymous: campaign.anonymous,
    // Which promise this form makes: a members-only campaign keeps "your answer is anonymous" but not
    // "nobody knows you took part", and a respondent told the wrong one has been misled.
    access: campaign.access as CampaignAccess,
    estimatedSeconds: campaign.template.estimatedSeconds,
    subjects: campaign.subjects
      .filter(({ subject }) => subject.archivedAt === null)
      .map(({ subject }) => ({ id: subject.id, name: subject.name })),
    questions: campaign.template.questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      text: question.text,
      config: question.config as QuestionConfig,
      required: question.required,
      position: question.position,
    })),
  };
}

// Records one submission: the participant row, the response, and its answers, in one transaction.
export async function submitResponse(
  req: Request,
  campaign: LiveCampaign,
  body: SubmitResponseBody,
  // The member behind a members-only submission, or null. Passed in as a named argument on purpose,
  // so the one place that touches a respondent's identity is something somebody had to hand over.
  memberId: string | null,
): Promise<SubmitResult> {
  const subjectId = resolveSubject(
    campaign.subjects.map(({ subject }) => subject.id),
    body.subjectId,
  );
  const answers = validateAnswersAgainstTemplate(campaign.template.questions, body.answers);
  const restricted = campaign.access === 'organization';

  const count = await runInTransaction(req, async (tx) => {
    if (restricted && memberId) {
      // Written FIRST, so a second submission aborts before any answer row exists. The refusal comes from
      // the primary key, not from a read, because check-then-insert has a race and this is the table where losing it matters.
      await tx.campaignParticipant
        .create({ data: { campaignId: campaign.id, userId: memberId } })
        .catch((error: unknown) => {
          if (isDuplicateParticipant(error)) {
            throw new ConflictError('You have already responded to this one.');
          }
          throw error;
        });
    }

    // The response row has NO respondent column and never will: anonymity is a property of the schema,
    // not a setting. memberId is in scope here and deliberately does not appear below - the participant row
    // says THAT somebody answered, this one says WHAT was said, and nothing joins the two.
    const response = await tx.response.create({
      data: {
        campaignId: campaign.id,
        ...(subjectId ? { subjectId } : {}),
        channel: body.channel,
        ...(body.durationMs !== undefined ? { durationMs: body.durationMs } : {}),
      },
      select: { id: true },
    });

    await tx.answer.createMany({
      data: answers.map((answer) => ({
        responseId: response.id,
        questionId: answer.questionId,
        value: answer.value as never,
        // The numeric value is written alongside the raw value, never on its own: it is what keeps the results page fast.
        ...(answer.numericValue !== null ? { numericValue: answer.numericValue } : {}),
      })),
    });

    // A submission is a state change, so it is audited - but with no actor and no IP, whoever submitted.
    // Otherwise a signed-in member's id would sit next to a response committed in the same transaction.
    req.ctx.audit.push({
      action: 'response.submit',
      targetType: 'campaign',
      targetId: campaign.id,
    });

    return tx.response.count({ where: { campaignId: campaign.id } });
  });

  // The number the thank-you page shows, read inside the same transaction so it agrees with the results.
  return { ok: true, responseCount: count };
}

// A duplicate on the participants table is the one-per-member rule firing. Any other unique violation is a real bug.
function isDuplicateParticipant(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  // Postgres reports the constraint columns as an array; other databases use a string.
  const target = error.meta?.['target'];
  if (Array.isArray(target)) return target.includes('campaign_id') || target.includes('campaignId');
  return typeof target === 'string' && target.includes('campaign');
}

// Helpers.

// Picks which subject this submission is about.
function resolveSubject(available: string[], requested?: string): string | undefined {
  if (requested) {
    if (!available.includes(requested)) throw uniform404();
    return requested;
  }
  // One subject is the common case - one course, one restaurant, one ward - and picking from a list of one is noise.
  if (available.length === 1) return available[0];
  if (available.length === 0) return undefined;
  throw new ValidationError(
    new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['body', 'subjectId'],
        message: 'Choose which one this feedback is about',
      },
    ]),
  );
}

type QuestionRow = {
  id: string;
  kind: string;
  config: unknown;
  required: boolean;
  text: string;
};

type PreparedAnswer = {
  questionId: string;
  value: SubmitResponseBody['answers'][number]['value'];
  numericValue: number | null;
};

// The second half of validation: the schema already checked each answer's shape, but it has never seen
// the question row, so this checks the answer actually fits the question it is attached to.
// Both kinds of failure come back in the same 422 shape, so the respondent UI renders them the same way.
export function validateAnswersAgainstTemplate(
  questions: QuestionRow[],
  answers: SubmitResponseBody['answers'],
): PreparedAnswer[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const issues: z.ZodIssue[] = [];
  const prepared: PreparedAnswer[] = [];
  const answered = new Set<string>();

  for (const [index, answer] of answers.entries()) {
    const question = byId.get(answer.questionId);
    const at = (field: string) => ['body', 'answers', index, field];

    if (!question) {
      // An answer to a question that is not on this form: the form is fine, the submission is not.
      issues.push({
        code: z.ZodIssueCode.custom,
        path: at('questionId'),
        message: 'That question is not part of this form',
      });
      continue;
    }
    if (answer.value.kind !== question.kind) {
      issues.push({
        code: z.ZodIssueCode.custom,
        path: at('value'),
        message: 'That answer does not match the question',
      });
      continue;
    }

    const config = question.config as QuestionConfig;
    if (answer.value.kind === 'rating' && config.kind === 'rating') {
      if (answer.value.n > config.max) {
        issues.push({
          code: z.ZodIssueCode.custom,
          path: at('value'),
          message: `Choose a number from 1 to ${config.max}`,
        });
        continue;
      }
    }
    if (answer.value.kind === 'single' && config.kind === 'single') {
      if (!config.allowOther && !config.options.includes(answer.value.option)) {
        issues.push({
          code: z.ZodIssueCode.custom,
          path: at('value'),
          message: 'Choose one of the options shown',
        });
        continue;
      }
    }
    if (answer.value.kind === 'multi' && config.kind === 'multi') {
      const unknown = answer.value.options.filter((option) => !config.options.includes(option));
      if (unknown.length > 0) {
        issues.push({
          code: z.ZodIssueCode.custom,
          path: at('value'),
          message: 'Choose from the options shown',
        });
        continue;
      }
      if (config.maxSelections && answer.value.options.length > config.maxSelections) {
        issues.push({
          code: z.ZodIssueCode.custom,
          path: at('value'),
          message: `Choose at most ${config.maxSelections}`,
        });
        continue;
      }
    }

    answered.add(question.id);
    prepared.push({
      questionId: question.id,
      value: answer.value,
      numericValue: numericOf(answer.value),
    });
  }

  for (const question of questions) {
    if (!question.required || answered.has(question.id)) continue;
    issues.push({
      code: z.ZodIssueCode.custom,
      path: ['body', 'answers'],
      message: `"${question.text}" needs an answer`,
    });
  }

  if (issues.length > 0) throw new ValidationError(new z.ZodError(issues));
  return prepared;
}

// Only the two numeric kinds have a number; everything else is aggregated by counting.
const numericOf = (value: SubmitResponseBody['answers'][number]['value']): number | null =>
  value.kind === 'rating' || value.kind === 'nps' ? value.n : null;
