// Unit DTOs. 13 § Structure, 32.
import { z } from 'zod';
import { dto, Id } from './common.js';

/** The cap, in units created per request. Shared so the client can say why before it asks. */
export const MAX_REPEAT = 50;

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
    /**
     * `Wing A..F` — the index is rendered as a letter rather than a number, 0 = A. Kept as
     * a flag over a numeric pair rather than a second shape, so the cap and the ordering
     * refinements below apply to both forms without being written twice.
     */
    letters: z.boolean().default(false),
  })
  .refine((range) => range.to >= range.from, {
    message: 'The range must end at or after it starts',
    path: ['to'],
  })
  .refine((range) => range.to - range.from < MAX_REPEAT, {
    message: 'That range would create more than 50 units at once',
    path: ['to'],
  })
  .refine((range) => !range.letters || range.to <= 25, {
    message: 'A letter range stops at Z',
    path: ['to'],
  });
export type RepeatRange = z.infer<typeof RepeatRange>;

/* --------------------------------------------------------------- range syntax
 * `Floor 1..8` in a name field creates eight siblings (32 § Range syntax). Hotels,
 * colleges and hospitals are full of numbered repetition, and this turns eight actions
 * into one.
 *
 * The grammar lives HERE, beside the schema, because two implementations of it is the
 * failure mode: the client would preview "Floor 1..Floor 8" while the server wrote
 * something else, and nobody would notice until a demo.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RANGE = /^(.*?)\s*(?:(\d{1,6})\.\.(\d{1,6})|([A-Za-z])\.\.([A-Za-z]))$/;

/**
 * `"Floor 1..8"` → `{ name: 'Floor', repeat: { from: 1, to: 8, letters: false } }`.
 * A plain name comes back with no `repeat`, so callers can hand the result straight to
 * `CreateUnitBody` either way.
 *
 * Out-of-cap ranges parse rather than fail — `1..10000` produces a repeat whose count the
 * caller can report as "that would create 10000" before the server refuses it. Refusing
 * here with `null` would leave the client unable to say WHY.
 */
export function parseUnitRange(input: string): { name: string; repeat?: RepeatRange } {
  const trimmed = input.trim();
  const match = RANGE.exec(trimmed);
  const stem = match?.[1]?.trim();
  if (!match || !stem) return { name: trimmed };

  if (match[2] !== undefined && match[3] !== undefined) {
    return { name: stem, repeat: { from: Number(match[2]), to: Number(match[3]), letters: false } };
  }
  const from = LETTERS.indexOf((match[4] ?? '').toUpperCase());
  const to = LETTERS.indexOf((match[5] ?? '').toUpperCase());
  if (from < 0 || to < 0) return { name: trimmed };
  return { name: stem, repeat: { from, to, letters: true } };
}

/** How many units a repeat would create. Negative ranges count as zero, not as a crash. */
export const repeatCount = (repeat: RepeatRange): number => Math.max(repeat.to - repeat.from + 1, 0);

/** The names a repeat expands to, in order. One definition, both sides. */
export function expandUnitNames(name: string, repeat?: RepeatRange): string[] {
  if (!repeat) return [name];
  return Array.from({ length: repeatCount(repeat) }, (_, index) =>
    repeat.letters
      ? `${name} ${LETTERS[repeat.from + index] ?? ''}`.trim()
      : `${name} ${repeat.from + index}`,
  );
}

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
  /**
   * DISTINCT PEOPLE placed on this unit, not the number of positions in it — `DEC-082`.
   *
   * A `position` is a role-at-unit SLOT shared by everyone who holds that role there
   * (`10` §2.1, and `createAssignment` finds one before it creates one). A ward with a
   * Head, two Nurses and three Patients has three positions and six people, so counting
   * position rows answered "how many distinct roles are present" under a field named
   * `peopleCount`, everywhere in the product at once.
   */
  peopleCount: number;
  subjectCount: number;
  /**
   * This unit AND everything under it. What every surface prints (`DEC-081`).
   *
   * Server-side, and it has to be: people are counted DISTINCT across the branch, and a
   * person holding a role in two units of one branch is one person. That cannot be
   * recovered from per-unit scalars, which is what a client-side sum was adding up.
   * INV-003 still holds — the rollup runs over the units this caller may see and no
   * others, so a total never discloses a branch they cannot open.
   */
  peopleTotal: number;
  subjectTotal: number;
  children: UnitNode[];
};

/**
 * The forest's own totals, on the `GET /units` envelope.
 *
 * Not derivable by summing the roots for the same reason a branch is not derivable by
 * summing children: one person may be placed under two of them.
 */
export type UnitTreeTotals = {
  people: number;
  subjects: number;
  units: number;
};

/**
 * Who a unit's people actually are — `DEC-083`.
 *
 * `total` is DISTINCT people in the branch, the same figure `peopleTotal` carries. The role
 * counts may sum HIGHER than it, because one person can hold two roles inside the branch;
 * each role's own count is distinct, so a Nurse in two wards is one Nurse. Anything reading
 * this must not present the parts as a partition of the whole.
 */
export type UnitComposition = {
  unitId: string;
  total: number;
  /** Ladder order — level 1 first, matching `/app/roles` (`33`). */
  byRole: Array<{ roleId: string; roleName: string; level: number; count: number }>;
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
