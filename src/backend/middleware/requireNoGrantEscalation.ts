// Link 10b, second placement. INV-012 on the POWERS GRID. 33 § "The escalation bound",
// 11 §5b, DEC-039.
//
// `requireNoEscalation` bounds a POSITION — this role, at this unit. This bounds a GRANT —
// this role, this capability, this scope — and 33 says why the grid needs its own:
//
//   "Editing a role's row raises everyone holding it, so this screen is the highest-leverage
//    place in the product to hand out a power you do not have."
//
// It was a live hole. `PUT /grants` carried `requireCapability('grant.update')` and nothing
// else, so anyone the administrator delegated the grid to could write themselves — or any
// role they hold — every capability in the catalogue. Same shape as `D-018`, one screen
// along: the route's own check passed, because nobody had asked the second question.
//
// A SIBLING OF requireNoEscalation, NOT AN EXTENSION OF IT (INV-009 is about a second
// PLACEMENT of one thing; this is a second RULE). The inputs do not meet: a position is a
// role at a unit and resolves to a capability set through the graph, while a grid cell IS a
// capability at a scope and names no unit at all.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE BOUND IS "EVERYWHERE", AND THE FIRST VERSION OF THIS FILE GOT IT WRONG.
//
// A grid cell says nothing about WHERE. It grants capability C to a role, and that role can
// later be placed at any unit by anybody holding `assignment.create`. So the saver cannot
// know where the power they are handing out will end up being exercised, and the only honest
// bound is: they must be able to exercise it EVERYWHERE IN THE ORGANISATION themselves.
//
// The first version compared SCOPE WIDTHS — `SCOPE_BREADTH[cell.scope] > SCOPE_BREADTH[mine]`
// against `heldCapabilities()`. That is wrong in both directions and the tests caught it
// immediately, by refusing the FOUNDER:
//
//   the seeded matrix gives level 1 `campaign.launch: subtree`, not `all` (50 §1) — because
//   a subtree anchored at the ROOT unit already is the whole organisation. The owner of a
//   brand-new org could not grant `campaign.launch: all` on their own grid.
//
// and it is wrong the other way too: `subtree` anchored at Section A is NOT the whole
// organisation, and a width comparison cannot tell the two apart, because
// `heldCapabilities()` deliberately discards the anchor — its own comment says the map
// "cannot say WHICH units and does not pretend to".
//
// So this asks `visibleUnits()`, the same primitive `findEscalation` uses, which resolves the
// anchor. Scope width is not consulted at all.
import type { RequestHandler } from 'express';
import { CAPABILITY_CATALOGUE, describeCapability, type Capability } from '@endur/shared';
import type { PutGrantsBody } from '@endur/shared';
import { prisma } from '../db/client.js';
import { seesNothing, visibleUnits, type Visibility } from '../authz/visibility.js';
import { UnauthenticatedError, WouldEscalateError } from '../lib/errors.js';
import { nounsOf } from '../lib/vocabulary.js';

/** Marks the route as bounded, so the enumeration test can SEE it rather than parse source. */
export const GRANT_ESCALATION_TAG = Symbol.for('endur.noGrantEscalation');

export const requireNoGrantEscalation = (): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    void guard(req).then(next).catch(next);
  };
  return Object.assign(handler, { [GRANT_ESCALATION_TAG]: true });
};

async function guard(req: Parameters<RequestHandler>[0]): Promise<void> {
  const principal = req.ctx.principal;
  const orgId = req.ctx.orgId;
  if (principal?.kind !== 'user' || !principal.id || !orgId) throw new UnauthenticatedError();

  const { body } = req.data as { body: PutGrantsBody };

  // ONLY ALLOWS ARE BOUNDED. A `deny` cell and a `scope: null` cell both REDUCE what a role
  // can do, and refusing somebody the right to take a power away would make the bound a
  // weapon: a delegate could be prevented from undoing their own mistake.
  const raising = body.cells.filter(
    (cell) =>
      cell.effect === 'allow' &&
      cell.scope !== null &&
      // A capability that is not in the catalogue is a BAD REQUEST, not an escalation, and
      // `writeMatrix` already answers it with a `409` naming the typo. Without this line the
      // guard reached it first and said `403 WOULD_ESCALATE` — telling an administrator who
      // typed `campaign.obliterate` that they lack a power that does not exist.
      cell.capability in CAPABILITY_CATALOGUE,
  );
  if (raising.length === 0) return;

  // Shared with requireCapability's own lookups, so a route carrying both guards asks the
  // grant tables once (11 §7).
  const memo = (req.ctx.visibilityMemo ??= new Map()) as Map<string, Promise<Visibility>>;
  const authzVersion = req.ctx.authzVersion ?? 0;

  // DISTINCT CAPABILITIES ONLY. The grid saves the whole visible matrix — up to 2,000 cells
  // over 64 capabilities — and without this the bound would be the slowest thing on the
  // route by two orders of magnitude.
  const capabilities = [...new Set(raising.map((cell) => cell.capability))] as Capability[];
  // A capability whose every raising cell is `self` makes no unit claim, so "everywhere"
  // is the wrong bound for it — the same reading `findEscalation` already takes when it
  // skips `self` grants outright (authz/escalation.ts). A `self` cell says "each holder of
  // this role may do this TO THEMSELVES", and no placement of that role widens it.
  //
  // D-047: without this, the `self`-only rows of the improvement loop — `reflection.*`,
  // `actionplan.*`, seeded at `self` and never at `all` — were ungrantable by anybody,
  // including the founder, because nobody can hold at `all` a capability the matrix only
  // ever writes at `self`. A paid-for Gold feature with no in-product path to it.
  const selfOnly = new Set(
    capabilities.filter((capability) =>
      raising.every((cell) => cell.capability !== capability || cell.scope === 'self'),
    ),
  );
  let unitCount: number | null = null;

  for (const capability of capabilities) {
    const reach = await visibleUnits({ orgId, userId: principal.id, capability, authzVersion, memo });

    if (seesNothing(reach)) {
      throw new WouldEscalateError(
        `You cannot give a role “${describeCapability(capability, nounsOf(req))}” — ` +
          'you do not hold it yourself.',
        capability,
      );
    }
    if (reach.all) continue;
    // Held at all, over some units, or over themselves — any of the three is enough to
    // hand out a power that reaches nobody but its holder.
    if (selfOnly.has(capability)) continue;

    // Counted once per request, and only when some capability is genuinely unit-scoped —
    // an owner never reaches this line.
    unitCount ??= await prisma.node.count({ where: { orgId, kind: 'unit' } });
    if (reach.unitIds.length >= unitCount) continue;

    throw new WouldEscalateError(
      `You cannot give a role “${describeCapability(capability, nounsOf(req))}” — ` +
        'a role can be given to anybody anywhere, and you do not hold that ' +
        'everywhere in this organisation.',
      capability,
    );
  }
}
