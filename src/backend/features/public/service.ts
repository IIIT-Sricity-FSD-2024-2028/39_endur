// The respondent surface. 13 §6, 39, DEC-009, INV-006.
//
// Two rules govern everything in this file:
//
//   1. The payload is built from an EXPLICIT ALLOWLIST. Omission is a thing you forget; an
//      allowlist is a thing you have to add to. This is reachable by anyone with a link.
//   2. Invalid, unlaunched, closed and expired tokens produce the SAME 404. An existence
//      probe must not be able to tell them apart.
import { resolveLabels } from '@endur/shared';
import type {
  LabelSet,
  PublicCampaign,
  QuestionConfig,
  SubmitResponseBody,
  SubmitResult,
} from '@endur/shared';
import type { Request } from 'express';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { isAccepting } from '../campaigns/status.js';
import { z } from 'zod';

/**
 * One 404 for every reason a token might not work.
 *
 * Different messages here would turn this endpoint into an oracle: try a token, and the
 * wording tells you whether that campaign exists, whether it has launched, and whether it
 * has closed. Same object, thrown from every path.
 */
const uniform404 = () => new NotFoundError('That link is not available.');

export async function readPublicCampaign(token: string): Promise<PublicCampaign> {
  const campaign = await prisma.campaign.findUnique({
    where: { publicToken: token },
    select: {
      name: true,
      anonymous: true,
      publicToken: true,
      closedAt: true,
      startsAt: true,
      endsAt: true,
      org: { select: { name: true, labels: true } },
      subjects: { select: { subject: { select: { id: true, name: true, archivedAt: true } } } },
      template: {
        select: {
          estimatedSeconds: true,
          questions: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              kind: true,
              text: true,
              config: true,
              required: true,
              position: true,
            },
          },
        },
      },
    },
  });

  if (!campaign) throw uniform404();
  // Scheduled, closed and expired all land here, and all leave as the same 404 an unknown
  // token produces.
  if (!isAccepting(campaign)) throw uniform404();

  // The allowlist. Every key below is one somebody deliberately added; nothing arrives here
  // because a row happened to carry it.
  return {
    campaignName: campaign.name,
    organizationName: campaign.org.name,
    labels: resolveLabels(campaign.org.labels as LabelSet),
    anonymous: campaign.anonymous,
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

export async function submitResponse(
  req: Request,
  token: string,
  body: SubmitResponseBody,
): Promise<SubmitResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      orgId: true,
      publicToken: true,
      closedAt: true,
      startsAt: true,
      endsAt: true,
      subjects: { select: { subjectId: true } },
      template: {
        select: {
          questions: {
            select: { id: true, kind: true, config: true, required: true, text: true },
          },
        },
      },
    },
  });

  if (!campaign) throw uniform404();
  if (!isAccepting(campaign)) throw uniform404();

  const subjectId = resolveSubject(campaign.subjects.map((s) => s.subjectId), body.subjectId);
  const answers = validateAnswersAgainstTemplate(campaign.template.questions, body.answers);

  const count = await runInTransaction(req, async (tx) => {
    // The row this writes has NO respondent column and never will (INV-006). It cannot
    // identify who answered because it has nothing to identify them with — anonymity is a
    // property of the schema, not a setting the application respects.
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
        // Written ALONGSIDE value, never independently (10 §4.4). Extracting
        // (value->>'n')::numeric on every row at read time is the difference between a
        // fast results page and a slow one, and it cannot be backfilled honestly later.
        ...(answer.numericValue !== null ? { numericValue: answer.numericValue } : {}),
      })),
    });

    // A respondent is not a principal, so there is no grant that decided this and no actor
    // to record. The row still goes in: INV-007 is about every state change, and a
    // submission is the most consequential one in the product.
    req.ctx.audit.push({
      action: 'response.submit',
      targetType: 'campaign',
      targetId: campaign.id,
    });

    return tx.response.count({ where: { campaignId: campaign.id } });
  });

  // The number the thank-you page shows. It has to agree with the results count, which is
  // why it is read inside the same transaction that wrote the row (39 § Acceptance).
  return { ok: true, responseCount: count };
}

/* ---------------------------------------------------------------- helpers */

function resolveSubject(available: string[], requested?: string): string | undefined {
  if (requested) {
    if (!available.includes(requested)) throw uniform404();
    return requested;
  }
  // One subject is the common case — a form about one course, one restaurant, one ward —
  // and asking the respondent to pick from a list of one would be noise.
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

/**
 * The semantic half of validation (14 §4).
 *
 * `validate()` has already checked that each answer is a well-formed member of the union.
 * What it cannot check is whether the answer fits the question it is attached to — the
 * schema has never seen the question row. Both failures produce the same 422 shape so the
 * respondent UI renders them identically.
 */
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
      // An answer to a question that is not on this form. Not a 404 — the form is fine,
      // the submission is not.
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

/** Only the two numeric kinds have one. Everything else aggregates by counting. */
const numericOf = (value: SubmitResponseBody['answers'][number]['value']): number | null =>
  value.kind === 'rating' || value.kind === 'nps' ? value.n : null;
