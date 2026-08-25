// The simulator's wire format. 13 § Trust, 42.
import { z } from 'zod';
import { dto } from './common.js';

export const SimulateTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('org') }),
  z.object({ kind: z.literal('unit'), unitId: z.string().uuid() }),
  z.object({ kind: z.literal('person'), userId: z.string().uuid() }),
  z.object({ kind: z.literal('subject'), subjectId: z.string().uuid() }),
  z.object({ kind: z.literal('campaign'), campaignId: z.string().uuid() }),
]);
export type SimulateTarget = z.infer<typeof SimulateTarget>;

export const SimulateBody = z.object({
  principalUserId: z.string().uuid(),
  capability: z.string().min(1).max(60),
  target: SimulateTarget,
  // "would this be allowed on 20 Aug?" — tests delegation windows before they take effect.
  at: z.coerce.date().optional(),
});
export type SimulateBody = z.infer<typeof SimulateBody>;

export const SimulateDto = dto({ body: SimulateBody });
