// Campaign DTOs. 13 § Campaigns, 38, 14 §1, DEC-016.
import { z } from 'zod';
import { dto, Id, PageQuery } from './common.js';

/**
 * Status is DERIVED, never stored (DEC-016). These are the four values that derivation can
 * produce, kept here as a type so the client can switch on them exhaustively.
 */
export const CampaignStatus = z.enum(['draft', 'scheduled', 'open', 'closed']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

/**
 * Who the campaign is for. `anyone` is the default and the one the demo uses: a link or a
 * QR code that anybody holding it can answer.
 *
 * The other two exist because "everyone in this department" and "everyone with this role"
 * are the two questions an organisation actually asks, and both are answerable from the
 * org graph without inventing a mailing list.
 */
export const AudienceRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('anyone') }),
  z.object({ kind: z.literal('unit'), unitId: Id, includeSubtree: z.boolean().default(true) }),
  z.object({ kind: z.literal('role'), roleId: Id }),
]);
export type AudienceRule = z.infer<typeof AudienceRule>;

export const CreateCampaignBody = z
  .object({
    name: z.string().min(1).max(120),
    templateId: Id,
    subjectIds: z.array(Id).min(1).max(200),
    audience: AudienceRule,
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    /**
     * Immutable once the campaign leaves draft, enforced by a database trigger and not
     * only here (10 §4.3). Respondents were promised anonymity at submission time; letting
     * an administrator flip it afterwards would retroactively break that promise.
     */
    anonymous: z.boolean().default(true),
  })
  .refine((body) => !body.startsAt || !body.endsAt || body.endsAt > body.startsAt, {
    message: 'End must be after start',
    path: ['endsAt'],
  });
export type CreateCampaignBody = z.infer<typeof CreateCampaignBody>;

export const UpdateCampaignBody = z.object({
  name: z.string().min(1).max(120).optional(),
  subjectIds: z.array(Id).min(1).max(200).optional(),
  audience: AudienceRule.optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  anonymous: z.boolean().optional(),
});
export type UpdateCampaignBody = z.infer<typeof UpdateCampaignBody>;

export const CampaignListQuery = PageQuery.extend({
  status: CampaignStatus.optional(),
});
export type CampaignListQuery = z.infer<typeof CampaignListQuery>;

export const CreateCampaignDto = dto({ body: CreateCampaignBody });
export const UpdateCampaignDto = dto({ body: UpdateCampaignBody, params: z.object({ id: Id }) });
export const CampaignIdDto = dto({ params: z.object({ id: Id }) });
export const CampaignListDto = dto({ query: CampaignListQuery });

/** Response shapes. */
export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  templateId: string;
  templateName: string;
  subjectCount: number;
  responseCount: number;
  anonymous: boolean;
  startsAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  /** Present only once launched. A draft has no token and no reachable URL (38). */
  publicToken: string | null;
  url: string | null;
  createdAt: string;
};

export type CampaignDetail = CampaignSummary & {
  audience: AudienceRule;
  subjects: Array<{ id: string; name: string; unitName: string | null }>;
};

export type AudiencePreview = {
  estimatedCount: number;
  sample: Array<{ id: string; name: string }>;
};

export type LaunchResult = { publicToken: string; url: string; status: CampaignStatus };
