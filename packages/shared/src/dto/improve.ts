// The improve loop. 44, T-083.
//
// THE ORDERING CONSTRAINT IS IN THIS FILE'S SHAPES, not only in the service: `GapView` is
// what a reviewee gets AFTER submitting their own reflection, and there is no DTO at all
// for "the received scores on their own". A client that ignores the lock has nothing to
// ask for.
import { z } from 'zod';
import { dto, nameField } from './common.js';
import { Id } from './common.js';
import { SubmittedAnswer } from './response.js';
import type { AnswerValue } from './response.js';

/** Where a reviewee is in the loop, for one cycle. */
export const REFLECT_STATES = ['due', 'reflected', 'planned', 'finalised'] as const;
export type ReflectState = (typeof REFLECT_STATES)[number];

export const SubmitReflectionBody = z.object({
  subjectId: Id,
  answers: z.array(SubmittedAnswer).max(50),
});
export type SubmitReflectionBody = z.infer<typeof SubmitReflectionBody>;

export const PlanItem = z.object({
  text: nameField(500),
  dueAt: z.string().date().optional(),
  status: z.enum(['open', 'done']).default('open'),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const CreatePlanBody = z.object({ items: z.array(PlanItem).min(1).max(20) });
export type CreatePlanBody = z.infer<typeof CreatePlanBody>;

export const CheckinBody = z.object({
  actionPlanId: Id,
  notes: z.string().max(4000).optional(),
  heldAt: z.string().datetime().optional(),
});
export type CheckinBody = z.infer<typeof CheckinBody>;

export const CheckinPatchBody = z.object({
  notes: z.string().max(4000).optional(),
  heldAt: z.string().datetime().optional(),
  /** Irreversible, and the database refuses a second attempt (44, the trigger). */
  finalise: z.boolean().optional(),
});
export type CheckinPatchBody = z.infer<typeof CheckinPatchBody>;

export const CyclesDto = dto({});
export const CampaignParam = z.object({ campaignId: Id });
export const ReflectDto = dto({ params: CampaignParam, body: SubmitReflectionBody });
export const GapDto = dto({ params: CampaignParam });
export const PlanDto = dto({ params: CampaignParam, body: CreatePlanBody });
export const FinaliseDto = dto({ params: z.object({ id: Id }) });
export const CheckinCreateDto = dto({ body: CheckinBody });
export const CheckinPatchDto = dto({ params: z.object({ id: Id }), body: CheckinPatchBody });

/** One cycle on `/app/reflect`. */
export type ReflectionCycle = {
  campaignId: string;
  campaignName: string;
  subjectId: string;
  subjectName: string;
  status: ReflectState;
  endsAt: string | null;
  closed: boolean;
  reflectedAt: string | null;
  planId: string | null;
  planFinalisedAt: string | null;
};

export type GapRow = {
  questionId: string;
  text: string;
  /** Both on the same scale, or both `null` where the kind has no number (text, multi).
   *  A gap is only meaningful where the two are comparable, and saying so is cheaper than
   *  inventing a number for a paragraph. */
  self: number | null;
  received: number | null;
  /** `self - received`, or null. NEVER labelled good or bad here: a blind spot and
   *  under-confidence are different facts and neither is a grade (44 § The gap view). */
  delta: number | null;
  scaleMax: number | null;
};

export type GapView = {
  campaignId: string;
  campaignName: string;
  subjectId: string;
  subjectName: string;
  reflectedAt: string;
  /** The k-anonymity gate reaches here too. Below the threshold there are no `rows` at all
   *  — a reviewee with three responses would otherwise be shown a number that identifies
   *  whoever wrote it (52 §2, INV-007). */
  suppressed: boolean;
  threshold: number;
  responseCount: number;
  rows?: GapRow[];
  plan: PlanView | null;
};

export type PlanView = {
  id: string;
  items: PlanItem[];
  finalisedAt: string | null;
  checkins: Array<{
    id: string;
    supervisorName: string;
    notes: string | null;
    heldAt: string | null;
    finalisedAt: string | null;
  }>;
};

/** The reflection form's own question set — the campaign's, unchanged (INV-008). */
export type ReflectionForm = {
  campaignId: string;
  campaignName: string;
  subjectId: string;
  subjectName: string;
  questions: Array<{
    id: string;
    kind: string;
    text: string;
    config: unknown;
    required: boolean;
    position: number;
  }>;
  answers: Array<{ questionId: string; value: AnswerValue }> | null;
};
