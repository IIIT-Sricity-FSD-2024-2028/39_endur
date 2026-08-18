// Link 10. The guard — the richest link, and the one that earns the phase.
//
// Authorisation is decided HERE, never inside a handler and never in the frontend
// (INV-003). The API returns only what the caller may see; the UI trusts it.
import type { Request, RequestHandler } from 'express';
import type { Capability } from '@endur/shared';
import { resolve, type Decision, type Target } from '../authz/index.js';
import { AppError, ForbiddenError, UnauthenticatedError } from '../lib/errors.js';
import { isProd } from '../lib/config.js';

export type CapabilityOptions = {
  target?: Target['kind'];
  /** Where the target id lives in the VALIDATED request: 'params.id', 'body.unitId'. */
  from?: string;
};

/** Marks a handler as guarded, so the route-enumeration test can SEE it (T-014). */
export const CAPABILITY_TAG = Symbol.for('endur.capability');

export const requireCapability = (
  capability: Capability,
  opts: CapabilityOptions = {},
): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void guard(req, capability, opts).then(next).catch(next);
  };
  // Without this the test would have to parse source, which is the kind of check that
  // rots. A tag on the function is what the router stack actually carries.
  return Object.assign(handler, { [CAPABILITY_TAG]: capability });
};

async function guard(req: Request, capability: Capability, opts: CapabilityOptions) {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (!principal || !orgId) throw new UnauthenticatedError();

  // Only a user principal has grants. An API key carries scopes (45) and a respondent has
  // no console access at all, so neither reaches this guard by design.
  if (principal.kind !== 'user') {
    throw new ForbiddenError('This credential cannot perform console actions.');
  }

  const decision = await resolve({
    orgId,
    userId: principal.id,
    capability,
    target: buildTarget(req, opts, principal.id),
    // Per-request memo: a list handler often asks the same question repeatedly (11 §7).
    memo: (req.ctx.authzMemo ??= new Map()),
  });

  // Carried forward so the audit row can record WHICH GRANT decided it (INV-007).
  req.ctx.decision = decision;
  if (!decision.allowed) throw forbidden(decision);
}

function forbidden(decision: Decision): AppError {
  const details: Record<string, unknown> = { reason: decision.reason };
  if (decision.decidedBy) details.decidedBy = decision.decidedBy;
  // `considered` would let an outsider map the org's permission structure from a series of
  // 403s, so it never leaves production. Outside it, it is the fastest debugging tool here.
  if (!isProd) details.considered = decision.considered;
  return new AppError('FORBIDDEN', messageFor(decision), details);
}

const messageFor = (decision: Decision): string =>
  decision.reason === 'explicit_deny'
    ? 'You are explicitly blocked from doing this.'
    : decision.reason === 'out_of_scope'
      ? 'You can do this, but not here.'
      : decision.reason === 'expired'
        ? 'The position that allowed this has ended.'
        : 'You do not have permission to do this.';

/**
 * The target id is read from `req.data` — the VALIDATED request — which is precisely why
 * `validate` must run before this middleware (12 §5). Reading raw input here would let a
 * caller point the check at one resource and the handler at another.
 */
function buildTarget(req: Request, opts: CapabilityOptions, userId: string): Target {
  const kind = opts.target ?? 'org';
  if (kind === 'org') return { kind: 'org' };
  if (kind === 'self') return { kind: 'self', userId };

  const id = opts.from ? readPath(req.data, opts.from) : undefined;
  if (kind === 'person') {
    return { kind: 'person', userId: id ?? userId };
  }
  if (kind === 'unit') {
    if (!id) throw new AppError('BAD_REQUEST', 'No unit was identified for this request.');
    return { kind: 'unit', unitId: id };
  }
  return id ? { kind, unitId: id } : { kind };
}

function readPath(data: unknown, path: string): string | undefined {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}
