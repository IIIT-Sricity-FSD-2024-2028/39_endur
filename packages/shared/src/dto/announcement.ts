// Announcement DTOs. 13 § Announcements, T-094.
//
// THE AUDIENCE IS `AudienceRule` AND NOT A LIST OF PEOPLE. There is no recipient field here,
// and adding one is the edit this file must never take: the moment a client can name
// recipients, "everyone in Housekeeping" becomes a snapshot somebody has to maintain by
// hand, and the org graph stops being the answer to who anything reaches.
import { z } from 'zod';
import { dto, Id } from './common.js';
import { AudienceRule } from './campaign.js';

export const CreateAnnouncementBody = z.object({
  title: z.string().min(1).max(140),
  /** Plain text, never HTML — see the schema comment. Long enough for a real notice. */
  body: z.string().min(1).max(5000),
  audience: AudienceRule,
});
export type CreateAnnouncementBody = z.infer<typeof CreateAnnouncementBody>;

/**
 * Draft only. The service refuses the whole body once `publishedAt` is set (409), because
 * publishing is a promise about what was sent: editing afterwards would change the words
 * under the people who already read them, and the receipts would still say they had.
 */
export const UpdateAnnouncementBody = z.object({
  title: z.string().min(1).max(140).optional(),
  body: z.string().min(1).max(5000).optional(),
  audience: AudienceRule.optional(),
});
export type UpdateAnnouncementBody = z.infer<typeof UpdateAnnouncementBody>;

export const AnnouncementPreviewBody = z.object({ audience: AudienceRule });
export type AnnouncementPreviewBody = z.infer<typeof AnnouncementPreviewBody>;

export const AnnouncementListDto = dto({});
export const AnnouncementIdDto = dto({ params: z.object({ id: Id }) });
export const CreateAnnouncementDto = dto({ body: CreateAnnouncementBody });
export const UpdateAnnouncementDto = dto({
  params: z.object({ id: Id }),
  body: UpdateAnnouncementBody,
});
export const AnnouncementPreviewDto = dto({ body: AnnouncementPreviewBody });

/**
 * One announcement, as every screen reads it.
 *
 * `recipients` and `read` are the pair that makes the feature worth building, and they are
 * only meaningful together: `recipients` is the denominator SNAPSHOTTED at publish time —
 * the number of receipt rows — not a count of who is in the unit today. A draft has neither,
 * and reports 0 for both because it has been sent to nobody.
 */
export type AnnouncementSummary = {
  id: string;
  title: string;
  body: string;
  audience: AudienceRule;
  /** ISO, or null while it is a draft. Null is the ONLY thing that means "draft". */
  publishedAt: string | null;
  createdAt: string;
  authorName: string | null;
  recipients: number;
  read: number;
  /**
   * Whether the READER has read it — `null` when they are not a recipient at all, which is
   * how an author who addressed a unit they are not in gets no "unread" banner for their
   * own notice.
   */
  readByMe: boolean | null;
};

/** What the composer shows while somebody is choosing an audience. */
export type AnnouncementPreview = { recipients: number };
