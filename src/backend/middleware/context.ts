// The request context: one object that each middleware adds its own field to, and handlers only read.
import type { RequestHandler } from 'express';
// Decision belongs to the permission resolver; importing it keeps a single definition of that shape.
import type { Decision } from '../authz/types.js';
import type { PlatformRole, ResolvedLabels, SupportContext } from '@endur/shared';

export type { Decision };

// Who is making the request. Set by authenticate, in four kinds, so later links need not care which.
export type Principal =
  // A signed-in staff user. 'support' is filled in when an Endur operator is working inside this org.
  | { kind: 'user'; id: string; orgId: string; support?: SupportContext }
  | { kind: 'apiKey'; id: string; orgId: string; scopes: string[] }
  | { kind: 'respondent'; campaignId: string; orgId: string }
  // An Endur operator on the platform side: the only principal with no orgId, since they belong to Endur.
  | { kind: 'platform'; id: string; role: PlatformRole };

export type AuditIntent = {
  action: string;
  targetType?: string;
  targetId?: string;
};

export type RequestContext = {
  requestId: string;
  startedAt: number;
  // Set by tenantResolver, never read from a request body.
  orgId?: string;
  // The org's permission version. It is part of the grant cache key, so a permission change applies at once.
  authzVersion?: number;
  // The tenant's own words for unit, subject and so on, so even server error messages use its vocabulary.
  labels?: ResolvedLabels;
  // Set by authenticate.
  principal?: Principal;
  // Set by requireCapability and kept, so the audit row can record which grant decided it.
  decision?: Decision;
  // Audit rows added by handlers, written by ctx.tx inside the mutation's own transaction.
  audit: AuditIntent[];
  // Per-request memo of permission decisions; safe because one request is one snapshot in time.
  authzMemo?: Map<string, Promise<Decision>>;
  // The same idea for visibility lookups, which a list handler asks twice: once for rows, once for the count.
  visibilityMemo?: Map<string, Promise<unknown>>;
  // Set by ctx.tx once the audit rows are written; read by the auditWriter safety net.
  auditWritten?: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestContext;
      // The validated request data, set by validate(). Handlers read this, never req.body.
      data: unknown;
    }
  }
}

// Creates ctx at the very start, so every later link has somewhere to record itself.
export const context: RequestHandler = (req, _res, next) => {
  req.ctx = { requestId: '', startedAt: Date.now(), audit: [] };
  next();
};
