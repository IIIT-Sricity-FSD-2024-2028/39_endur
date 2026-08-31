// The simulator's wire format. 13 § Trust, 42.
import { z } from 'zod';
import { isCapability } from '../capabilities.js';
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
  // Validated against the catalogue, not merely against being a string. `isCapability`
  // is a type predicate, so this narrows the inferred type to `Capability` — which is
  // what the resolver takes, and what removes the `as never` the service used to need to
  // bridge the two. The behaviour improves with the type: a misspelt capability now gets
  // a 400 saying so, where before it resolved to a silent `no_grant` that read, on the
  // simulator, as a real permission answer (11 §3).
  capability: z
    .string()
    .min(1)
    .max(60)
    .refine(isCapability, { message: 'No such capability. See GET /authz/capabilities.' }),
  target: SimulateTarget,
  // "would this be allowed on 20 Aug?" — tests delegation windows before they take effect.
  at: z.coerce.date().optional(),
});
export type SimulateBody = z.infer<typeof SimulateBody>;

export const SimulateDto = dto({ body: SimulateBody });
