// Role DTOs. 13 § Roles and powers, 33.
import { z } from 'zod';
import { dto, Id } from './common.js';

export const CreateRoleBody = z.object({ name: z.string().min(1).max(60) });
export type CreateRoleBody = z.infer<typeof CreateRoleBody>;

export const UpdateRoleBody = z.object({ name: z.string().min(1).max(60) });
export type UpdateRoleBody = z.infer<typeof UpdateRoleBody>;

/**
 * **Levels are never sent.** They are derived from the order of `orderedIds` (33, `24` §4),
 * because a client-supplied level and a client-supplied order can disagree — and when they
 * do, one of them is silently wrong and nobody finds out until a permission is missing.
 *
 * The same rule governs question `position` (37) and wizard role order (31). It is worth
 * stating three times because it is the same class of bug each time.
 */
export const ReorderRolesBody = z.object({ orderedIds: z.array(Id).min(1).max(12) });
export type ReorderRolesBody = z.infer<typeof ReorderRolesBody>;

export const DeleteRoleBody = z.object({
  /** Where the people holding it go. Without it, deleting a held role is refused. */
  reassignTo: Id.optional(),
});
export type DeleteRoleBody = z.infer<typeof DeleteRoleBody>;

export const CreateRoleDto = dto({ body: CreateRoleBody });
export const UpdateRoleDto = dto({ body: UpdateRoleBody, params: z.object({ id: Id }) });
export const ReorderRolesDto = dto({ body: ReorderRolesBody });
export const DeleteRoleDto = dto({ body: DeleteRoleBody, params: z.object({ id: Id }) });

export type RoleView = {
  id: string;
  name: string;
  /** Ordering only. The level rule is a seeded default, never the enforcement (CONF-002). */
  level: number;
  peopleCount: number;
  grantCount: number;
};
