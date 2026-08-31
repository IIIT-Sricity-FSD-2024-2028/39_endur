// Link 10. The authorisation guard. Every protected route passes through here,
// so permission is never decided inside a handler and never in the frontend.
import type { Request, RequestHandler } from 'express';
import type { Capability } from '@endur/shared';
import {
  resolve,
  seesNothing,
  visibleUnits,
  type Decision,
  type Target,
} from '../authz/index.js';
import { AppError, ForbiddenError, NotFoundError, UnauthenticatedError } from '../lib/errors.js';
import { isProd } from '../lib/config.js';
import { writeDenial } from '../db/tx.js';

export type CapabilityOptions = {
  // target 'any' is for list routes: the question becomes "do you hold this anywhere", and the handler returns only visible rows.
  target?: Target['kind'] | 'any';
  // Where the target id sits in the validated request, for example 'params.id' or 'body.unitId'.
  from?: string;
};

// Marks a handler as guarded, so the route test can see which capability protects it.
export const CAPABILITY_TAG = Symbol.for('endur.capability');

// Builds the middleware that guards one route with one capability.
export const requireCapability = (
  capability: Capability,
  opts: CapabilityOptions = {},
): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void guard(req, capability, opts).then(next).catch(next);
  };
  // The tag rides on the function itself, so the test reads the real router stack instead of parsing source code.
  return Object.assign(handler, { [CAPABILITY_TAG]: capability });
};

// The check itself: work out the target, ask the resolver, then allow, 403 or 404.
async function guard(req: Request, capability: Capability, opts: CapabilityOptions) {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (!principal || !orgId) throw new UnauthenticatedError();

  // Only a signed-in user has grants: an API key carries scopes and a respondent has no console access.
  if (principal.kind !== 'user') {
    throw new ForbiddenError('This credential cannot perform console actions.');
  }

  const authzVersion = req.ctx.authzVersion ?? 0;

  if (opts.target === 'any') {
    const visibility = await visibleUnits({
      orgId,
      userId: principal.id,
      capability,
      authzVersion,
      memo: (req.ctx.visibilityMemo ??= new Map()) as never,
    });
    if (seesNothing(visibility)) {
      await record(req, capability);
      throw new ForbiddenError('You do not have permission to do this.');
    }
    return;
  }

  const decision = await resolve({
    orgId,
    userId: principal.id,
    capability,
    // Part of the grant cache key, so any permission change invalidates cached decisions at once.
    authzVersion,
    target: buildTarget(req, opts, principal.id),
    // Per-request memo, because a list handler often asks the same question many times.
    memo: (req.ctx.authzMemo ??= new Map()),
  });

  // Kept on ctx so the audit row can record which grant decided it.
  req.ctx.decision = decision;
  if (decision.allowed) return;

  // 404 when the caller cannot even see the resource, since a 403 would confirm it exists; 403 with a trace when they can.
  if (decision.reason === 'out_of_scope' && (await invisible(req, opts))) {
    await record(req, capability, decision);
    throw new NotFoundError();
  }
  await record(req, capability, decision);
  throw forbidden(decision);
}

// Writes a "denied" audit row, for state-changing actions only - a refused GET is the system working normally.
async function record(req: Request, capability: Capability, decision?: Decision): Promise<void> {
  if (req.method === 'GET' || capability.endsWith('.read')) return;
  await writeDenial(req, capability, decision?.decidedBy);
}

// Is the target a unit the caller cannot see at all? Always asked with unit.read, because the target here is always a unit.
async function invisible(req: Request, opts: CapabilityOptions): Promise<boolean> {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (principal?.kind !== 'user' || !orgId) return false;

  const target = buildTarget(req, opts, principal.id);
  const unitId = 'unitId' in target ? target.unitId : undefined;
  if (!unitId) return false;

  const visibility = await visibleUnits({
    orgId,
    userId: principal.id,
    capability: 'unit.read',
    authzVersion: req.ctx.authzVersion ?? 0,
    memo: (req.ctx.visibilityMemo ??= new Map()) as never,
  });
  if (visibility.all) return false;
  return !visibility.unitIds.includes(unitId);
}

// Builds the 403 error, with the decision trace attached outside production.
function forbidden(decision: Decision): AppError {
  const details: Record<string, unknown> = { reason: decision.reason };
  if (decision.decidedBy) details.decidedBy = decision.decidedBy;
  // The list of grants considered never leaves production: a series of 403s would map out the org's structure.
  if (!isProd) details.considered = decision.considered;
  return new AppError('FORBIDDEN', messageFor(decision), details);
}

// The message the caller sees, chosen from the reason the request was refused.
const messageFor = (decision: Decision): string =>
  decision.reason === 'explicit_deny'
    ? 'You are explicitly blocked from doing this.'
    : decision.reason === 'out_of_scope'
      ? 'You can do this, but not here.'
      : decision.reason === 'expired'
        ? 'The position that allowed this has ended.'
        : 'You do not have permission to do this.';

// Builds the target from the VALIDATED request, which is why validate() must run before this middleware.
function buildTarget(req: Request, opts: CapabilityOptions, userId: string): Target {
  const kind = opts.target === 'any' ? 'org' : (opts.target ?? 'org');
  if (kind === 'org') return { kind: 'org' };
  if (kind === 'self') return { kind: 'self', userId };

  const id = opts.from ? readPath(req.data, opts.from) : undefined;
  if (kind === 'person') {
    return { kind: 'person', userId: id ?? userId };
  }
  if (kind === 'unit') {
    // No unit id means an org-level action, which only an 'all' scope grant can reach.
    return id ? { kind: 'unit', unitId: id } : { kind: 'org' };
  }
  return id ? { kind, unitId: id } : { kind };
}

// Reads a dotted path such as 'params.id' out of the validated data.
function readPath(data: unknown, path: string): string | undefined {
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}
