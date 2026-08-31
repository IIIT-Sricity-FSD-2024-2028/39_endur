// Link 10. The guard — the richest link, and the one that earns the phase.
//
// Authorisation is decided HERE, never inside a handler and never in the frontend
// (INV-003). The API returns only what the caller may see; the UI trusts it.
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
  /**
   * `any` is for LIST routes. The question a list asks is not "may you act on this one" but
   * "do you hold this anywhere" — the filtering itself is the authorisation, and the
   * handler then returns only the rows the caller may see (INV-003). Without it a list
   * would be checked against an org-level target, which a unit-scoped grant deliberately
   * cannot reach, and every scoped role would get a 403 for their own department.
   */
  target?: Target['kind'] | 'any';
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
    // Part of the grant cache key: any permission change bumps it, and every cached
    // decision for this tenant stops being trusted immediately (11 §7).
    authzVersion,
    target: buildTarget(req, opts, principal.id),
    // Per-request memo: a list handler often asks the same question repeatedly (11 §7).
    memo: (req.ctx.authzMemo ??= new Map()),
  });

  // Carried forward so the audit row can record WHICH GRANT decided it (INV-007).
  req.ctx.decision = decision;
  if (decision.allowed) return;

  // 404 versus 403, decided deliberately (13 §5).
  //
  // A resource the caller cannot even SEE must answer 404: a 403 would confirm it exists
  // and leak the organisation's structure to somebody outside it. A resource they CAN see
  // but may not act on answers 403 WITH the trace, because that is actionable — it tells
  // them whom to ask.
  if (decision.reason === 'out_of_scope' && (await invisible(req, opts))) {
    await record(req, capability, decision);
    throw new NotFoundError();
  }
  await record(req, capability, decision);
  throw forbidden(decision);
}

/**
 * DEC-041. Write the refusal — for MUTATING capabilities only.
 *
 * Two conditions, and they catch different mistakes. The METHOD is the doc's own wording:
 * *"a 403 on a GET is the permission system working as designed, thousands of times a
 * day"*, and logging those produces a table nobody can read. The CAPABILITY is the belt to
 * that brace, because a read is occasionally shaped like a write — `POST /authz/simulate`
 * asks a question and changes nothing, and a simulator run that a caller may not perform
 * is not a security event.
 *
 * A 404 is recorded too. From the caller's side it is indistinguishable from a 403 by
 * design (13 §5), but from the ORGANISATION'S side it is the more interesting of the two:
 * somebody reached for a resource so far outside their scope that we would not confirm it
 * exists.
 */
async function record(req: Request, capability: Capability, decision?: Decision): Promise<void> {
  if (req.method === 'GET' || capability.endsWith('.read')) return;
  await writeDenial(req, capability, decision?.decidedBy);
}

/**
 * Is the target outside what the caller can read at all?
 *
 * ASKED WITH `unit.read`, ALWAYS, because the only target this function ever sees is a
 * UNIT — everything without a `unitId` returns false two lines up. That is the safe
 * direction and it is also the honest one: 13 §5 splits on whether the caller can see
 * THE RESOURCE THE REQUEST NAMES, and for a unit-anchored guard the resource the request
 * names is the unit in `body.unitId` or `params.id`.
 *
 * It used to derive `<module>.read` from the acting capability, which is right for
 * `unit.update` (`unit.read`) and near enough for `subject.create` (`subject.read`), and
 * WRONG for `assignment.create`: there is no `assignment.read` in the catalogue and there
 * should not be — an assignment is never read on its own, it is read as part of the person
 * who holds it. So the visibility question was asked with a capability nobody holds,
 * `visibleUnits` correctly answered "nowhere", and every out-of-scope assignment came back
 * `404 Not found.` — including one at a unit the caller had just picked out of their own
 * unit menu. 13 §5 calls that case a 403 precisely because it is actionable; "Not found."
 * for a unit on their own screen reads as a bug in the product.
 *
 * A derived name that silently means "deny everything" when the capability does not exist
 * is the failure mode worth naming here: nothing errored, and a security-shaped default
 * hid a usability bug for as long as nobody was scoped tightly enough to hit it.
 */
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
  const kind = opts.target === 'any' ? 'org' : (opts.target ?? 'org');
  if (kind === 'org') return { kind: 'org' };
  if (kind === 'self') return { kind: 'self', userId };

  const id = opts.from ? readPath(req.data, opts.from) : undefined;
  if (kind === 'person') {
    return { kind: 'person', userId: id ?? userId };
  }
  if (kind === 'unit') {
    // No unit id means the action is org-level — creating a root unit, for instance. That
    // is not an error: an org-level target is one a unit-scoped grant deliberately cannot
    // reach (11 §4), so only an `all` scope satisfies it and the default stays deny.
    return id ? { kind: 'unit', unitId: id } : { kind: 'org' };
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
