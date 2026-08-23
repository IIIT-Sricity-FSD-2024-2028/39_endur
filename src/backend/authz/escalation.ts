// INV-012 — the escalation bound. 11 §5b, DEC-039.
//
// resolve() answers "may this caller act on this target". It does NOT answer "may this
// caller create an actor more powerful than themselves", and until 2026-08-23 nothing did.
// That was a live hole, not a hypothetical one:
//
//   addAssignment() checked `assignment.create` on the target unit and NOTHING ELSE. A
//   departmental coordinator -- whose job genuinely is to put people into positions, and
//   who would legitimately hold exactly that one capability -- could assign the OWNER role
//   at the root unit to a colleague, or to a second account of their own, and hold the
//   organisation an hour later. Every check passed. There was no bug to point at: the
//   resolver worked exactly as specified, because nobody had specified this.
//
// The rule, from 11 §5b:
//
//   the capability set the new position would resolve to, AT THE UNITS IT RESOLVES THEM AT,
//   must be a SUBSET of the actor's own set at those same units.
//
// Computed from the same grants the resolver reads, NEVER from Node.level. A comparison
// like "level 3 may create level 4 and below" would re-introduce the integer-level model
// through a side door (DEC-002, CONF-002) and would be wrong the moment an administrator
// edits the powers grid so a lower-numbered role holds less.
import type { Capability } from '@endur/shared';
import { prisma } from '../db/client.js';
import { unitSubtree } from '../db/graph.js';
import { visibleUnits, type Visibility } from './visibility.js';

export type EscalationFinding = {
  capability: Capability;
  unitId: string;
};

export type BoundInput = {
  orgId: string;
  /** The caller. Their reach is the ceiling. */
  actorUserId: string;
  /** The position being created: this role, at this unit. */
  roleId: string;
  unitId: string;
  at?: Date;
  authzVersion?: number;
  /** Per-request memo, shared with the rest of the resolver's callers. */
  memo?: Map<string, Promise<Visibility>>;
};

/**
 * The first capability the candidate position would confer that the actor does not hold at
 * the units it would confer it, or `null` when the bound is satisfied.
 *
 * Returns the FIRST finding rather than all of them: the caller needs one specific power
 * named to understand the refusal, and enumerating every over-reach of an Owner role would
 * produce a forty-item list that says less than one line does.
 */
export async function findEscalation(input: BoundInput): Promise<EscalationFinding | null> {
  const at = input.at ?? new Date();
  const confer = await positionWouldConfer(input.orgId, input.roleId, input.unitId, at);
  if (confer.size === 0) return null;

  const memo = input.memo ?? new Map<string, Promise<Visibility>>();

  for (const [capability, reach] of confer) {
    const held = await visibleUnits({
      orgId: input.orgId,
      userId: input.actorUserId,
      capability,
      at,
      ...(input.authzVersion === undefined ? {} : { authzVersion: input.authzVersion }),
      memo,
    });

    // The actor reaches everywhere with this capability, so no candidate reach can exceed
    // it. Note this is `all` AFTER anchored denies were subtracted (visibility.ts), which
    // is what makes the deny corollary below fall out rather than needing its own pass.
    if (held.all) continue;

    if (reach === 'all') return { capability, unitId: input.unitId };

    const heldUnits = new Set(held.unitIds);
    for (const unitId of reach) {
      // THE DENY COROLLARY, and it needs no special case: visibleUnits() has already
      // removed the units an anchored deny covers, so a capability the actor is denied at
      // unit U simply has U missing from `heldUnits`. Without this, a deny would be
      // escapable by proxy and INV-004 would become a suggestion.
      if (!heldUnits.has(unitId)) return { capability, unitId };
    }
  }

  return null;
}

/**
 * What a position of `roleId` at `unitId` would confer, as capability -> the units it
 * reaches (or 'all').
 *
 * Reads grants on the ROLE node and on the POSITION node for that (role, unit) pair when
 * one already exists — addAssignment() shares one position node per pair (people/service.ts),
 * so a position-level grant attached earlier is part of what the new holder would receive.
 * Missing that second source would let somebody escalate by picking a role that looks
 * harmless and a unit where its position has already been given extra powers.
 */
async function positionWouldConfer(
  orgId: string,
  roleId: string,
  unitId: string,
  at: Date,
): Promise<Map<Capability, Set<string> | 'all'>> {
  const position = await prisma.node.findFirst({
    where: { orgId, kind: 'position', roleId, unitId },
    select: { id: true },
  });

  const subjectIds = position ? [roleId, position.id] : [roleId];
  const grants = await prisma.grant.findMany({
    where: {
      orgId,
      subjectId: { in: subjectIds },
      effect: 'allow',
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    select: { capability: true, scope: true },
  });

  const out = new Map<Capability, Set<string> | 'all'>();
  let subtree: string[] | null = null;

  for (const grant of grants) {
    const capability = grant.capability as Capability;

    // `self` confers the power to act on YOURSELF and reaches no unit. Handing somebody
    // `person.update:self` is not escalation — it is what UNIVERSAL_SELF_GRANTS gives every
    // role in the product, and treating it as a unit claim would make every assignment
    // fail for a caller whose own self-grant happens to sit elsewhere.
    if (grant.scope === 'self') continue;

    if (grant.scope === 'all') {
      out.set(capability, 'all');
      continue;
    }

    const existing = out.get(capability);
    if (existing === 'all') continue;

    const units = existing ?? new Set<string>();
    if (grant.scope === 'own_unit') {
      units.add(unitId);
    } else {
      // `subtree` — one query for the whole role, not one per grant.
      subtree ??= await unitSubtree(orgId, unitId);
      for (const id of subtree) units.add(id);
    }
    out.set(capability, units);
  }

  return out;
}
