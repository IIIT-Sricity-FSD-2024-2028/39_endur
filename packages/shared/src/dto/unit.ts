// Unit DTOs. 13 § Structure, 32.
import { z } from 'zod';
import { dto, Id } from './common.js';

/**
 * `Floor 1..8` creates eight siblings in one request (32). The expansion is server-side
 * and capped, because the interesting half of that acceptance item is the second half —
 * `1..10000` must be refused, and a client-side loop would happily fire ten thousand
 * requests before anyone noticed.
 */
export const RepeatRange = z
  .object({
    from: z.number().int().min(0).max(9999),
    to: z.number().int().min(0).max(9999),
  })
  .refine((range) => range.to >= range.from, {
    message: 'The range must end at or after it starts',
    path: ['to'],
  })
  .refine((range) => range.to - range.from < 50, {
    message: 'That range would create more than 50 units at once',
    path: ['to'],
  });

export const CreateUnitBody = z.object({
  name: z.string().min(1).max(80),
  /** null creates a second root, which is legitimate: there is never one global tree (10). */
  parentId: Id.nullable(),
  /** A temporary unit's children carry end dates, so nobody has to remember to revoke (10 §9). */
  isTemporary: z.boolean().default(false),
  endsAt: z.coerce.date().optional(),
  repeat: RepeatRange.optional(),
});
export type CreateUnitBody = z.infer<typeof CreateUnitBody>;

export const UpdateUnitBody = z.object({
  name: z.string().min(1).max(80).optional(),
  isTemporary: z.boolean().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
export type UpdateUnitBody = z.infer<typeof UpdateUnitBody>;

export const ReparentBody = z.object({ newParentId: Id.nullable() });
export type ReparentBody = z.infer<typeof ReparentBody>;

export const DeleteUnitBody = z.object({
  /** Where the children go. Without it, deleting a unit with children is refused. */
  reassignChildrenTo: Id.optional(),
});
export type DeleteUnitBody = z.infer<typeof DeleteUnitBody>;

export const CreateUnitDto = dto({ body: CreateUnitBody });
export const UpdateUnitDto = dto({ body: UpdateUnitBody, params: z.object({ id: Id }) });
export const ReparentUnitDto = dto({ body: ReparentBody, params: z.object({ id: Id }) });
export const DeleteUnitDto = dto({ body: DeleteUnitBody, params: z.object({ id: Id }) });
export const UnitIdDto = dto({ params: z.object({ id: Id }) });

/** Response shapes. */
export type UnitNode = {
  id: string;
  name: string;
  parentId: string | null;
  isTemporary: boolean;
  endsAt: string | null;
  peopleCount: number;
  subjectCount: number;
  children: UnitNode[];
};

export type UnitImpact = {
  unitId: string;
  unitName: string;
  /** Everything below it, so a delete confirmation can state real numbers (32). */
  descendantCount: number;
  peopleAffected: number;
  subjectsAffected: number;
  campaignsAffected: number;
  /** Only populated for a reparent preview: who gains reach, and who loses it. */
  gained: Array<{ personId: string; name: string; capability: string }>;
  lost: Array<{ personId: string; name: string; capability: string }>;
};
