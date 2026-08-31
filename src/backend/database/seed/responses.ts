// How a seeded campaign gets its answers: response rows first, then one answer per question.
//
// EXTRACTED FROM demo.ts, and shared rather than copied. Two seeds now write historical responses —
// the four generic demo organisations and the one hand-built college in iiit.ts — and a second copy
// of the skew is a second results screen that can drift out of agreement with the first.
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { QuestionKind } from '@endur/shared';
import { poolFor, type Tone } from './comments.js';
import type { Rng } from './random.js';
import { skewedNps, skewedRating, skewedTimestamp } from './random.js';

export type ResponsePlan = {
  rng: Rng;
  industry: string;
  campaignId: string;
  templateId: string;
  /**
   * `count` overrides `perSubject` for one subject, EXACTLY, with none of the jitter below.
   * A suggestion box wants precisely as many responses as it has written suggestions — one
   * more and the generic pool starts talking about lecture pacing inside a hostel's inbox.
   */
  subjects: Array<{ id: string; quality: number; count?: number }>;
  perSubject: number;
  startsAt: Date;
  endsAt: Date;
  /**
   * Hand-written comments, per subject, used INSTEAD of the generic pool on the earliest
   * responses to that subject and in this order.
   *
   * WHY THIS EXISTS. The pool in `comments.ts` is written per INDUSTRY, so it can say
   * something plausible about a course and nothing at all about a broken washing machine in
   * BH1. A named complaint that a reader can follow from a suggestion box, through a poll,
   * to the thing that got fixed is the difference between a populated organisation and a
   * believable one. Anything past the end of a subject's list falls back to the pool.
   */
  comments?: Record<string, string[]>;
};

// Writes the responses in bulk rather than one at a time, so db:reset stays under 30 seconds.
export async function seedResponses(prisma: PrismaClient, plan: ResponsePlan): Promise<void> {
  const questions = await prisma.question.findMany({
    where: { templateId: plan.templateId },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, config: true },
  });
  if (questions.length === 0) return;

  // Ids are minted here rather than read back afterwards. The old shape re-queried the whole
  // campaign, so a SECOND call on the same campaign re-processed the FIRST call's responses and
  // was only saved from duplicating every answer by `skipDuplicates` — which would also have
  // silently swallowed a scripted comment. Owning the ids removes the round trip and the trap.
  const created: Array<{ id: string; subjectId: string; scripted: string | undefined }> = [];
  const responses: Prisma.ResponseCreateManyInput[] = [];

  for (const subject of plan.subjects) {
    // Counts vary per subject: the same number everywhere reads as fake at a glance.
    const count =
      subject.count ??
      Math.max(1, Math.round(plan.perSubject * (0.6 + plan.rng.next() * 0.8)));
    const scripted = [...(plan.comments?.[subject.id] ?? [])];
    for (let i = 0; i < count; i += 1) {
      const id = randomUUID();
      created.push({ id, subjectId: subject.id, scripted: scripted.shift() });
      responses.push({
        id,
        campaignId: plan.campaignId,
        subjectId: subject.id,
        submittedAt: skewedTimestamp(plan.rng, plan.startsAt, plan.endsAt),
        channel: plan.rng.chance(0.55) ? 'qr' : 'link',
        durationMs: plan.rng.int(25_000, 180_000),
      });
    }
  }

  await prisma.response.createMany({ data: responses });

  const qualityBySubject = new Map(plan.subjects.map((s) => [s.id, s.quality]));

  const answers: Prisma.AnswerCreateManyInput[] = [];
  for (const response of created) {
    const quality = qualityBySubject.get(response.subjectId) ?? 0.6;
    for (const question of questions) {
      if (question.kind === 'text') {
        // A scripted comment is always written. Only the pool's filler is thinned out, because
        // not everybody answers every optional question.
        if (response.scripted !== undefined) {
          answers.push({
            responseId: response.id,
            questionId: question.id,
            value: { kind: 'text', text: response.scripted },
          });
          continue;
        }
        if (!plan.rng.chance(0.35)) continue;
      }
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
      // The numeric value is always written alongside the raw value, never on its own.
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
      // Comment tone follows the subject's quality, so words and numbers agree.
      const tone: Tone = rng.chance(quality) ? 'positive' : rng.chance(0.5) ? 'mixed' : 'negative';
      return {
        ...base,
        value: { kind: 'text', text: rng.pick(poolFor(plan.industry, tone)) },
      };
    }
  }
}
