// Grant DTOs — the powers grid's wire format. 13, 33, 11 §5.
import { z } from 'zod';
import { dto, Id } from './common.js';
import { EFFECTS, SCOPES } from '../capabilities.js';

// Built FROM the catalogue's own lists rather than restated. The scope order is meaningful
// and is expressed once (11 §4); a second copy here would be a second thing to keep right.
export const ScopeValue = z.enum(SCOPES);
export const EffectValue = z.enum(EFFECTS);

/**
 * One cell of the grid. `scope: null` means NO GRANT — an absent row, not a row with an
 * empty scope. Default deny is the model's floor (11 §5), so "no grant" has to be
 * expressible or the grid could never take a power away.
 */
export const GrantCell = z.object({
  roleId: Id,
  capability: z.string().min(1).max(60),
  scope: ScopeValue.nullable(),
  effect: EffectValue.default('allow'),
  /** { maxAmount: 25000 } — one capability at different strengths (11 §6). */
  params: z.record(z.number()).optional(),
});
export type GrantCell = z.infer<typeof GrantCell>;

/**
 * Bulk, and the whole matrix, in one transaction (13 §3).
 *
 * The grid is edited by clicking many cells. One request per cell would make undo
 * incoherent and recompute the warnings dozens of times — and a half-applied matrix is a
 * permission state nobody chose.
 */
export const PutGrantsBody = z.object({ cells: z.array(GrantCell).max(2000) });
export type PutGrantsBody = z.infer<typeof PutGrantsBody>;

export const PutGrantsDto = dto({ body: PutGrantsBody });

export type GrantWarning = {
  kind:
    | 'orphan_capability'
    | 'nobody_can'
    | 'self_approval'
    | 'deny_shadows_allow'
    | 'thin_starter_row';
  /** Plain language. The grid renders it next to the row it concerns, not in a console. */
  message: string;
  capability?: string;
  roleId?: string;
};

export type CapabilityMeta = {
  key: string;
  module: string;
  label: string;
  phase: string;
};
