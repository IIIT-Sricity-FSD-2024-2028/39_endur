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

/**
 * `71` § State — window and granularity are URL params on the FRONTEND so a figure quoted
 * in a message is re-openable; here they are just an optional range the service defaults
 * when absent (last 12 months, monthly — `71` § Interactions).
 */
export const AnalyticsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: z.enum(['month', 'quarter']).default('month'),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;
export const AnalyticsListDto = dto({ query: AnalyticsQuery });

export const LogListDto = dto({});

/**
 * `72` § "The file name is the whole attack surface" — bounded, but deliberately NOT the
 * real allowlist. The regex that decides which names are readable lives once, in
 * `src/backend/lib/logFile.ts`'s `filePattern`, and is applied by the reader. A second regex
 * here would be a second copy to keep in sync with the writer's.
 */
export const LogFileParam = z.object({ file: z.string().min(1).max(80) });

export const LogReadQuery = PageQuery.extend({
  level: z.coerce.number().int().optional(),
  status: z.coerce.number().int().optional(),
  path: z.string().max(200).optional(),
  orgId: Id.optional(),
  requestId: z.string().max(64).optional(),
  q: z.string().max(200).optional(),
});
export type LogReadQuery = z.infer<typeof LogReadQuery>;
export const LogReadDto = dto({ params: LogFileParam, query: LogReadQuery });

/**
 * `72` § Interactions, `DEC-074`. The same filters as a read — an export is the screen you
 * are looking at, as a file, and a second filter vocabulary would make the two diverge — minus
 * `cursor`, because an export is not paginated, and plus a format.
 *
 * `ndjson` is the lossless one and is the default: it carries `extra`, which is the field that
 * makes an unexpected key on a log line visible AS unexpected (`72` § Data contract). `csv` is
 * a fixed column set for somebody who will open it in a spreadsheet.
 */
export const LogExportQuery = LogReadQuery.omit({ cursor: true, limit: true }).extend({
  format: z.enum(['ndjson', 'csv']).default('ndjson'),
});
export type LogExportQuery = z.infer<typeof LogExportQuery>;
export const LogExportDto = dto({ params: LogFileParam, query: LogExportQuery });

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

/**
 * `71` § Data contract, copied field for field. There is no `price`, `amount`, or `currency`
 * anywhere in this shape — DEC-035 — and no field that could carry a response, an answer or
 * a respondent identity — INV-011. Every number here is a COUNT.
 */
export type PlatformAnalytics = {
  window: { from: string; to: string; granularity: 'month' | 'quarter' };

  orgs: {
    total: number;
    /** A tier was chosen — never includes a `trialing` or `cancelled` org. */
    joined: number;
    /** Counted APART from joined, everywhere on this page — decision 1, never folded in. */
    trialing: number;
    cancelled: number;
  };

  /** `trialing` organisations excluded — decision 1. */
  byTier: { tier: Tier; orgs: number; seats: number }[];

  /** Four counts per period, never netted into one — decision 2. */
  movement: { period: string; new: number; upgraded: number; downgraded: number; churned: number }[];

  /** `conversionRate` is `null`, not `0`, until a trial has completed — decision 3. */
  trials: { started: number; converted: number; expired: number; conversionRate: number | null };

  adoption: {
    orgsWithACampaign: number;
    orgsWithAResponse: number;
    /** Decision 4 — must match `70`'s estate list "Quiet" chip for the same organisations,
     *  because both read `isQuietOrg` from `@endur/shared`. */
    orgsQuiet30d: number;
  };

  /** COUNTS ONLY — INV-011. */
  totals: { seats: number; campaigns: number; responses: number };
};

/**
 * `72` § Data contract. One entry per rotating file — the list a client picks a name from,
 * never a directory listing the client asked for by pattern.
 */
export type LogFileMeta = {
  name: string;
  stream: 'app' | 'error';
  date: string;
  bytes: number;
  /** `null` when the file is larger than the count threshold — counting is not free */
  lines: number | null;
  modifiedAt: string;
};

/**
 * Where the files ARE, alongside the list of them. `18` §2 says logs are written to disk
 * automatically and rotated; an operator looking at a log screen should not have to read a
 * config file to find out where that disk is, or how long what they are looking at survives.
 */
export type LogStoreMeta = {
  dir: string;
  enabled: boolean;
  retentionDays: number;
  maxSizeMb: number;
};

/**
 * `72` § Data contract, copied field for field. `extra` is not laziness — it is what makes
 * an unexpected field on a log line visible AS unexpected, which is the whole reason a
 * catch-all beats a fixed list of named columns here (`56` § Anonymity, `72` § Data contract).
 * The same field carries an UNPARSEABLE line's raw text, flagged rather than dropped — see
 * the parser in `src/backend/platform/logs/`.
 */
export type LogLine = {
  at: string;
  level: number;
  msg: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  orgId?: string;
  principal?: string;
  err?: { type: string; message: string; stack?: string };
  extra?: Record<string, unknown>;
};
