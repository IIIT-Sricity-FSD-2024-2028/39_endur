// The request context: ONE object, built up by the chain, never mutated by handlers.
//
// Each link adds its own field and nothing else reaches back to change it. That is what
// makes the chain readable top to bottom — you can point at any link and say exactly what
// it contributed.
import type { RequestHandler } from 'express';
// The resolver owns Decision. This file used to declare a placeholder copy, from before
// authz/ existed; two definitions of the same shape is exactly the drift the DTO approach
// is meant to prevent.
import type { Decision } from '../authz/types.js';
import type { PlatformRole, ResolvedLabels } from '@endur/shared';

export type { Decision };

/** Set by authenticate (T-007). Three kinds, so downstream links need not care which. */
export type Principal =
  | { kind: 'user'; id: string; orgId: string }
  | { kind: 'apiKey'; id: string; orgId: string; scopes: string[] }
  | { kind: 'respondent'; campaignId: string; orgId: string }
  /**
   * T-059, DEC-033. THE ONLY PRINCIPAL WITH NO `orgId`, and that absence is the design:
   * an operator belongs to Endur rather than to a customer, so there is no organisation
   * for `tenantResolver` to resolve and none for a grant to be anchored in (19 §7).
   *
   * It carries a ROLE rather than a set of capabilities because the platform side has two
   * fixed roles and no resolver (19 §3) — `platformRoleHas()` is the whole decision.
   */
  | { kind: 'platform'; id: string; role: PlatformRole };

export type AuditIntent = {
  action: string;
  targetType?: string;
  targetId?: string;
};

export type RequestContext = {
  requestId: string;
  startedAt: number;
  /** Set by tenantResolver (T-006). NEVER read from a request body — INV-010. */
  orgId?: string;
  /**
   * organizations.settings.authzVersion, read alongside the tenant. It is part of the
   * grant cache key, so a permission change invalidates every cached decision for this
   * tenant instantly — the 30-second TTL is only a backstop (11 §7). Resolving it per
   * request is what makes that true; a constant here would leave a revoked permission
   * working for the length of the TTL, which is a security bug and not a trade-off.
   */
  authzVersion?: number;
  /**
   * The tenant's vocabulary, resolved, read alongside authzVersion in the same query
   * (T-044). 22 §6 has specified this since revision one — "the label set is on req.ctx
   * after tenantResolver, and message builders take it" — because THE SERVER PRODUCES
   * USER-FACING STRINGS TOO. `That unit does not exist.` renders verbatim in the console
   * (10 pages read `error.message`), so a hotel was told about a "unit" until T-044.
   *
   * Absent on the tenantless routes, which is why `nounsOf()` exists rather than call
   * sites reaching in here and finding `undefined` on the login screen.
   */
  labels?: ResolvedLabels;
  /** Set by authenticate (T-007). */
  principal?: Principal;
  /**
   * Set by requireCapability (T-012). Carried forward on purpose: the audit row records
   * WHICH GRANT decided it (INV-007), and the resolver is the only thing that knows.
   */
  decision?: Decision;
  /** Appended by handlers, flushed by ctx.tx inside the mutation's own transaction. */
  audit: AuditIntent[];
  /** Per-request resolver memo (11 §7). Correct by construction: a request is a snapshot. */
  authzMemo?: Map<string, Promise<Decision>>;
  /**
   * The list-side equivalent, for visibleUnits(). Separate from authzMemo because it
   * answers a different question and caches a different shape — a list handler asks it
   * twice, once for the rows and once for the scope-filtered count.
   */
  visibilityMemo?: Map<string, Promise<unknown>>;
  /** Set by ctx.tx once the audit rows are flushed; read by the auditWriter safety net. */
  auditWritten?: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestContext;
      /** Narrowed by validate(); handlers read this, never req.body (14 §3). */
      data: unknown;
    }
  }
}

/**
 * Bootstraps ctx. Runs first so that every later link — including a failure in the very
 * next one — has somewhere to record itself.
 */
export const context: RequestHandler = (req, _res, next) => {
  req.ctx = { requestId: '', startedAt: Date.now(), audit: [] };
  next();
};
