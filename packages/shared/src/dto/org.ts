// Organisation DTOs. 13 § Organisation, 31 § Data contract.
import { z } from 'zod';
import { dto, nameField } from './common.js';
import { LabelSet } from '../labels.js';

export const Industry = z.enum(['university', 'hotel', 'hospital', 'company', 'custom']);
export type Industry = z.infer<typeof Industry>;

export const UpdateOrgBody = z.object({
  name: z.string().min(1).max(120).optional(),
  industry: Industry.optional(),
});
export type UpdateOrgBody = z.infer<typeof UpdateOrgBody>;

export const UpdateLabelsBody = z.object({ labels: LabelSet });
export type UpdateLabelsBody = z.infer<typeof UpdateLabelsBody>;

/**
 * The wizard's single commit. Five steps, ONE request, ONE transaction (31).
 *
 * A five-step wizard that writes five times leaves half-built organisations behind every
 * time somebody closes the tab — an org with roles and no units is worse than no org,
 * because it looks finished from the outside.
 *
 * Role LEVEL is derived from array index: index 0 is level 1. It is never sent, because a
 * client-supplied level and a client-supplied order can disagree and then one is silently
 * wrong. Same rule as question `position` (37) and role reorder (33).
 *
 * Units arrive as a flat list with client-side `tempId`s rather than nested objects: a
 * flat list with parent references is the shape a tree editor already holds, and it makes
 * a cycle expressible-and-rejectable instead of impossible-to-express-but-also-untestable.
 */
export const SetupUnit = z.object({
  tempId: z.string().min(1).max(64),
  name: nameField(80),
  parentTempId: z.string().min(1).max(64).nullable(),
});
export type SetupUnit = z.infer<typeof SetupUnit>;

export const SetupOrgBody = z.object({
  industry: Industry,
  roles: z.array(z.object({ name: nameField(60) })).min(2).max(12),
  units: z.array(SetupUnit).min(1).max(200),
  labels: LabelSet,
  /** Copy the preset's starter templates in. Off is legitimate — an org may have its own. */
  includeTemplates: z.boolean().default(true),
});
export type SetupOrgBody = z.infer<typeof SetupOrgBody>;

export const UpdateOrgDto = dto({ body: UpdateOrgBody });
export const UpdateLabelsDto = dto({ body: UpdateLabelsBody });
export const SetupOrgDto = dto({ body: SetupOrgBody });

/** Response shapes. */
export type OrgView = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  labels: Record<string, { one: string; many: string }>;
  /** True once roles exist. The console redirects to /app/setup while this is false (46). */
  configured: boolean;
  /**
   * Where to render the organisation's logo, or null (48). A URL rather than a file id:
   * every consumer wants `<img src>`, and building the path in three components is three
   * places to change when storage moves behind a CDN.
   */
  logoUrl: string | null;
  createdAt: string;
};

export type PresetView = {
  key: Industry;
  displayName: string;
  roles: Array<{ name: string }>;
  units: Array<{ tempId: string; name: string; parentTempId: string | null }>;
  labels: Record<string, { one: string; many: string }>;
  templates: Array<{ name: string; category: string; questionCount: number }>;
};
