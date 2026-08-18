// The request context: ONE object, built up by the chain, never mutated by handlers.
//
// Each link adds its own field and nothing else reaches back to change it. That is what
// makes the chain readable top to bottom — you can point at any link and say exactly what
// it contributed.
import type { RequestHandler } from 'express';
import type { Capability, Scope, Effect } from '@endur/shared';

/** Set by authenticate (T-007). Three kinds, so downstream links need not care which. */
export type Principal =
  | { kind: 'user'; id: string; orgId: string }
  | { kind: 'apiKey'; id: string; orgId: string; scopes: string[] }
  | { kind: 'respondent'; campaignId: string; orgId: string };

/** Produced by the GRANT resolver (T-010). Carried forward deliberately — see below. */
export type Decision = {
  allowed: boolean;
  capability: Capability;
  reason: string;
  decidedBy?: { via: string; subjectName?: string; scope?: Scope; effect?: Effect };
  /** Omitted in production: enough to be actionable, not enough to map an org from outside. */
  considered?: unknown[];
};

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
  /** Set by authenticate (T-007). */
  principal?: Principal;
  /**
   * Set by requireCapability (T-012). Carried forward on purpose: the audit row records
   * WHICH GRANT decided it (INV-007), and the resolver is the only thing that knows.
   */
  decision?: Decision;
  /** Appended by handlers, flushed by ctx.tx inside the mutation's own transaction. */
  audit: AuditIntent[];
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
