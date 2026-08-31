// The platform surface. 19 §11, 70 § Data contract.
//
// EVERY TYPE IN THIS FILE IS INV-011 EXPRESSED AS A SHAPE. There is no field below that
// could carry an answer, a comment or a respondent identity — not because the handlers are
// careful, but because the contract has nowhere to put one. Adding such a field is a
// decision somebody has to make on purpose, in this file, rather than a convenience that
// slips into a select.
import { z } from 'zod';
import { Id, PageQuery, SearchQuery, dto, nameField, textField } from './common.js';
import { TIERS, type Currency, type Tier } from '../tiers.js';
import type { PaymentRecord } from './billing.js';
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

/**
 * A TIER AND NO AMOUNT, and DEC-080 does not change that. An override is a SUPPORT
 * action, not a sale: it moves a customer's plan without taking their money, writes no
 * `payments` row, and therefore never reaches `/ops/earnings`. An operator who could
 * name an amount here could invent revenue.
 */
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
  subject: nameField(200),
  body: textField(5000).min(1),
});
export const OrgMessageDto = dto({ params: OrgIdParam, body: OrgMessage });

export const PlatformAuditQuery = PageQuery.extend({
  action: z.string().max(64).optional(),
  orgId: Id.optional(),
});
export const PlatformAuditListDto = dto({ query: PlatformAuditQuery });

export const CreateOperator = z.object({
  email: z.string().email().max(254),
  name: nameField(120),
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

/**
 * `/ops/earnings` reads the SAME window as `/ops/analytics` and deliberately reuses its
 * shape rather than declaring a parallel one — an owner who narrows the date range on one
 * page and opens the other should not have to re-narrow it, and two query vocabularies for
 * one mental model is how the two pages start disagreeing about what "this quarter" means.
 */
export const EarningsQuery = AnalyticsQuery;
export type EarningsQuery = z.infer<typeof EarningsQuery>;
export const EarningsListDto = dto({ query: EarningsQuery });

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
  /**
   * THE TIER IN FORCE, which is not always the column — `DEC-113`. Once `periodEnd` has passed
   * the row still says `gold` until somebody opens the customer's own plan page and the write
   * catches up, so the estate derives the same answer the entitlement gate derives and shows
   * what the customer is actually being served. An operator looking at a list that says Gold
   * about an organisation the API is treating as Bronze cannot do their job.
   */
  tier: Tier;
  subscriptionStatus: string;
  /**
   * The last day of the current period, `null` for an organisation with no subscription row
   * at all (`D-012`). `70` renders it beside the tier: with expiry now real, *when* a plan runs
   * out is the fact the estate list was missing, and the owner has no other way to see who is
   * about to lapse.
   */
  periodEnd: string | null;
  /** What the plan WAS, when the last period ended and nobody renewed. `null` otherwise. */
  lapsedFrom: Tier | null;
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
 * `71` § Data contract, copied field for field. Every number in this shape is a COUNT, and
 * that stays true after DEC-080 gave the product prices back: money lives next door in
 * `PlatformEarnings` and `/ops/earnings`, and mixing the two would make a page that answers
 * "is this working?" also argue about revenue. No field here could carry a response, an
 * answer or a respondent identity — INV-011.
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

  /**
   * `trialing` organisations excluded — decision 1. AS OF TODAY, never windowed — `DEC-103`.
   * `subscriptions` holds one row per organisation with NO HISTORY, so "the tier mix on
   * 12 August" is not a question this database can answer, and the page says "as of today"
   * rather than implying the dates above governed it.
   *
   * NO `seats` — `DEC-102`. Nothing is billed per seat (`DEC-080` prices per organisation)
   * and `subscriptions.seats` has never been written (`D-013`), so a seat column on the
   * revenue owner's page measured something no invoice reads.
   */
  byTier: { tier: Tier; orgs: number }[];

  /**
   * Four counts per period, never netted into one — decision 2. THE ONLY WINDOWED SECTION ON
   * THE PAGE (`DEC-103`), which is why the page labels it and labels everything else "as of
   * today": five of six sections ignoring the date control is indistinguishable from a broken
   * control.
   *
   * `upgraded`/`downgraded` READ `payments`, not `plan.override` audit rows — `DEC-102`. The
   * old source is the OPERATOR'S action, so the table had only ever counted what operators
   * did while being labelled as the estate; a customer's own upgrade writes `billing.update`
   * to the tenant `audit_log`, which the query never read. `payments` carries `from_tier` and
   * `tier` on both write paths and is what `/ops/earnings` sums — one source for money and
   * movement, or the two pages disagree about the same event.
   *
   * DOWNGRADED MEANS THE PREVIOUS PLAN WAS HIGHER, whoever caused it. With `DEC-096` a
   * customer cannot move down at all, so the only downgrades are an operator override and the
   * scheduled expiry of `DEC-098` — which is why that transition writes a `payments` row of
   * `kind: 'expiry'`.
   */
  movement: { period: string; new: number; upgraded: number; downgraded: number; churned: number }[];

  /** AS OF TODAY — `DEC-103`. Adoption is a state of the estate, not an event in a window. */
  adoption: {
    orgsWithACampaign: number;
    orgsWithAResponse: number;
    /** Decision 4 — must match `70`'s estate list "Quiet" chip for the same organisations,
     *  because both read `isQuietOrg` from `@endur/shared`. */
    orgsQuiet30d: number;
  };

  /** COUNTS ONLY — INV-011. AS OF TODAY, and no `seats` — `DEC-102`, `DEC-103`. */
  totals: { campaigns: number; responses: number };
};

/**
 * `/ops/earnings` — the money, which DEC-080 gave the product back. Owner only, behind
 * `platform.revenue.read`.
 *
 * EVERY AMOUNT IS MINOR UNITS (paise) AS AN INTEGER, all the way to the browser. The client
 * formats with `formatMoney()` and never divides by 100 itself — a float that crosses a
 * network boundary is a rounding error waiting for a total to be summed downstream of it.
 *
 * STILL INV-011: there is no field here that could carry an answer, a comment or a
 * respondent identity. `payerName` is a STAFF user's name, captured at the moment they
 * pressed pay — the person who bought the plan, never anybody who answered a form.
 *
 * `tierOverTime` COUNTS PURCHASES IN EACH PERIOD, and it is not "how many organisations
 * were on Gold in March". `subscriptions` holds only the CURRENT tier with no history
 * (`schema.prisma`, and `<GrowthChart>`'s header records the same limit at length), so the
 * second question cannot be answered honestly and `71`'s own rule forbids inventing it.
 * What the ledger genuinely knows is what was bought, and when.
 */
export type PlatformEarnings = {
  window: { from: string; to: string; granularity: 'month' | 'quarter' };
  currency: Currency;

  totals: {
    revenueMinor: number;
    payments: number;
    /** Distinct organisations that have paid at least once IN THE WINDOW. */
    orgsPaying: number;
    /** `null` rather than 0 when nothing was captured — a mean of no payments is not zero. */
    averageMinor: number | null;
    /** Every capture ever, ignoring the window — the one lifetime figure on the page. */
    lifetimeRevenueMinor: number;
  };

  /** Revenue over time, one row per period in the window — empty periods included as 0. */
  byPeriod: { period: string; revenueMinor: number; payments: number }[];

  /**
   * The mix, two ways at once: what each tier has EARNED in the window, and how many
   * organisations sit on it RIGHT NOW. The pie draws `orgsOnTier`; the legend prints both.
   */
  byTier: { tier: Tier; payments: number; revenueMinor: number; orgsOnTier: number }[];

  /** Purchases per tier per period. Not a tier census — see the note above. */
  tierOverTime: { period: string; bronze: number; silver: number; gold: number }[];

  /** The most recent captures, newest first. */
  recent: Array<
    PaymentRecord & { orgId: string; orgName: string }
  >;

  /** The subset that MOVED a plan — `kind: 'change'` — newest first. */
  recentChanges: Array<
    PaymentRecord & { orgId: string; orgName: string }
  >;
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

/**
 * THE ENTERPRISE QUEUE — `DEC-100`, `T-100`, `70` § The Enterprise queue.
 *
 * A WORK ITEM, AND `status` IS THE WHOLE DIFFERENCE from the bell the directive first
 * suggested. What has to survive is not "somebody was told", it is "somebody has to ring this
 * customer back" — and a notification that clears on read loses exactly that. READING THE
 * QUEUE CHANGES NOTHING.
 *
 * STILL INV-011. An organisation's name, a person's name and address, a date and one note
 * they typed. No field here could carry a response, an answer or a respondent identity.
 */
export const EnterpriseStatus = z.enum(['open', 'contacted', 'closed']);
export type EnterpriseStatus = z.infer<typeof EnterpriseStatus>;

export const EnterpriseQueueQuery = z.object({
  /** Defaults to the only one worth opening the page for. */
  status: EnterpriseStatus.default('open'),
});
export type EnterpriseQueueQuery = z.infer<typeof EnterpriseQueueQuery>;
export const EnterpriseQueueDto = dto({ query: EnterpriseQueueQuery });

export const EnterpriseUpdate = z.object({ status: EnterpriseStatus });
export const EnterpriseUpdateDto = dto({ params: OrgIdParam, body: EnterpriseUpdate });

export type EnterpriseRequestRow = {
  id: string;
  at: string;
  org: { id: string; name: string; tier: Tier };
  /** CAPTURED at the time — the person may have left before anybody rings back. */
  askedName: string;
  askedEmail: string;
  note: string | null;
  status: EnterpriseStatus;
  handledAt: string | null;
};

