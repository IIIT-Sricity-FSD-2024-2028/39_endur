// Respondent DTOs — the only payloads a stranger's phone touches. 13 §6, 39, 14 §4.
import { z } from 'zod';
import { dto } from './common.js';
import type { ResolvedLabels } from '../labels.js';
import type { QuestionConfig, QuestionKind } from './template.js';

/**
 * Mirrors QuestionConfig, which is how "the answer type matches the question kind" (10 §10)
 * becomes a type error rather than a runtime surprise.
 *
 * Cross-checking an answer against ITS OWN question — is that option in that question's
 * list, is that number inside that question's max — is service-layer work, because the
 * schema cannot see the question row (14 §4).
 */
export const AnswerValue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rating'), n: z.number().int().min(1).max(10) }),
  z.object({ kind: z.literal('single'), option: z.string().max(200) }),
  z.object({ kind: z.literal('multi'), options: z.array(z.string().max(200)).max(10) }),
  z.object({ kind: z.literal('text'), text: z.string().max(2000) }),
  z.object({ kind: z.literal('yesno'), yes: z.boolean() }),
  z.object({ kind: z.literal('nps'), n: z.number().int().min(0).max(10) }),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

export const SubmittedAnswer = z.object({
  questionId: z.string().uuid(),
  value: AnswerValue,
});

export const SubmitResponseBody = z.object({
  /** Which subject is being reviewed. Required when a campaign carries more than one. */
  subjectId: z.string().uuid().optional(),
  answers: z.array(SubmittedAnswer).max(50),
  durationMs: z.number().int().min(0).max(60 * 60 * 1000).optional(),
  channel: z.enum(['link', 'qr', 'kiosk', 'api']).default('link'),
});
export type SubmitResponseBody = z.infer<typeof SubmitResponseBody>;

/** The token is 8 characters of the unambiguous alphabet (DEC-017). */
export const PublicTokenParam = z.object({
  token: z.string().min(6).max(128),
});

export const PublicCampaignDto = dto({ params: PublicTokenParam });
export const SubmitResponseDto = dto({ body: SubmitResponseBody, params: PublicTokenParam });

/**
 * EVERYTHING the respondent form needs, and nothing else (13 §6).
 *
 * This payload is reachable by anyone holding a link, so it is built from an explicit key
 * allowlist rather than by omitting fields from a database row — omission is a thing you
 * forget, an allowlist is a thing you have to add to.
 *
 * Excluded on purpose: the unit tree, role names, people, other campaigns, other subjects,
 * response counts, results, and any id that is not needed to submit.
 */
export type PublicCampaign = {
  campaignName: string;
  organizationName: string;
  /**
   * EVERY key present, not the org's partial override set. The respond world has no store
   * and therefore no `useLabels()` — this object IS the vocabulary for that world, and a
   * form that has to guard every noun against `undefined` is a form that will render one
   * of them as "undefined" on the demo phone. The server already sends exactly this;
   * saying so is what lets the page read `labels.respondent.many` and be right.
   */
  labels: ResolvedLabels;
  anonymous: boolean;
  estimatedSeconds: number;
  subjects: Array<{ id: string; name: string }>;
  questions: Array<{
    id: string;
    kind: QuestionKind;
    text: string;
    config: QuestionConfig;
    required: boolean;
    position: number;
  }>;
};

export type SubmitResult = {
  ok: true;
  /** What the thank-you page shows. It must agree with the results count (39). */
  responseCount: number;
};
