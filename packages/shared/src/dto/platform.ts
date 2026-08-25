// The platform surface. 19 §11, 70 § Data contract.
//
// EVERY TYPE IN THIS FILE IS INV-011 EXPRESSED AS A SHAPE. There is no field below that
// could carry an answer, a comment or a respondent identity — not because the handlers are
// careful, but because the contract has nowhere to put one. Adding such a field is a
// decision somebody has to make on purpose, in this file, rather than a convenience that
// slips into a select.
import { z } from 'zod';
import { dto, Id, PageQuery, SearchQuery } from './common.js';
import { TIERS, type Tier } from '../tiers.js';
import type { PlatformCapability, PlatformRole } from '../platform-capabilities.js';

/**
 * 19 §9. The code is REQUIRED, not optional — a single stolen operator password exposes
 * the plan data of every customer at once rather than one tenant, which is the whole
 * argument for MFA being the one security nicety this project does not defer.
 */
export const PlatformLogin = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  /** TOTP, six digits. A string, not a number: `012345` is not 12345. */
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator.'),
});
export type PlatformLoginBody = z.infer<typeof PlatformLogin>;
export const PlatformLoginDto = dto({ body: PlatformLogin });

/** 70 § Interactions — every filter is a URL param, so an operator can send a colleague a link. */
export const EstateQuery = PageQuery.merge(SearchQuery).extend({
  tier: z.enum(TIERS).optional(),
  status: z.string().max(24).optional(),
  industry: z.string().max(32).optional(),
});
export type EstateQuery = z.infer<typeof EstateQuery>;
export const EstateListDto = dto({ query: EstateQuery });

export const OrgIdParam = z.object({ id: Id });
export const PlatformOrgDto = dto({ params: OrgIdParam });

/** DEC-035 — a tier, and no amount anywhere. There is no price in Endur to send. */
export const OverridePlan = z.object({
  tier: z.enum(TIERS),
  reason: z.string().max(500).optional(),
});
export const OverridePlanDto = dto({ params: OrgIdParam, body: OverridePlan });

/**
 * Explicitly `{ suspended: boolean }` rather than two verbs. Un-suspending is the same
 * decision as suspending and belongs behind the same capability and the same audit row.
 */
export const Suspend = z.object({
  suspended: z.boolean(),
  reason: z.string().max(500).optional(),
});
export const SuspendDto = dto({ params: OrgIdParam, body: Suspend });

/**
 * NO RECIPIENT FIELD, and its absence is the acceptance criterion (70): recipients are
 * resolved server-side from who holds `org.update`. An operator typing an address is an
 * operator who can typo a customer's plan details to a stranger.
 */
export const OrgMessage = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});
export const OrgMessageDto = dto({ params: OrgIdParam, body: OrgMessage });

export const PlatformAuditQuery = PageQuery.extend({
  action: z.string().max(64).optional(),
  orgId: Id.optional(),
});
export const PlatformAuditListDto = dto({ query: PlatformAuditQuery });

export const CreateOperator = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  password: z.string().min(12).max(200),
  role: z.enum(['owner', 'staff']),
});
export const CreateOperatorDto = dto({ body: CreateOperator });

export const UpdateOperator = z.object({
  role: z.enum(['owner', 'staff']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
export const UpdateOperatorDto = dto({ params: OrgIdParam, body: UpdateOperator });

export const PlatformOperatorListDto = dto({});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export type PlatformMeResponse = {
  operator: { id: string; name: string; email: string; role: PlatformRole };
  capabilities: PlatformCapability[];
};

/**
 * One organisation in the estate list. A number, a name, a date or an enum — every field.
 *
 * `responsesLast30d` is a COUNT and `lastActivityAt` is a MAX(created_at). Those are the
 * only two things the platform seam will answer about `responses` at all (19 §5).
 */
export type PlatformOrgSummary = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  tier: Tier;
  subscriptionStatus: string;
  seats: number;
  seatLimit: number | null;
  activeCampaigns: number;
  responsesLast30d: number;
  lastActivityAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
};

export type PlatformOrgDetail = PlatformOrgSummary & {
  counts: { units: number; roles: number; people: number; subjects: number; campaigns: number; responses: number };
  /** So that "contact them" has somebody to contact (70 § Data contract). */
  administrators: Array<{ id: string; name: string; email: string }>;
  planHistory: Array<{ at: string; tier: Tier; by: string }>;
};

export type PlatformStats = {
  organizations: number;
  suspended: number;
  byTier: Record<Tier, number>;
  seats: number;
  campaigns: number;
  responses: number;
};

export type PlatformAuditEntry = {
  id: string;
  at: string;
  actor: { id: string; name: string } | null;
  action: string;
  org: { id: string; name: string } | null;
  payload: Record<string, unknown> | null;
  requestId: string | null;
};

export type PlatformOperator = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  status: string;
  lastLoginAt: string | null;
};
