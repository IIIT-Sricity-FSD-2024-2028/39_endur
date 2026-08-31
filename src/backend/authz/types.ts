// The resolver's vocabulary. 11 §5.
import type { Capability, Effect, Scope } from '@endur/shared';

/** What permission is being asked about. Resolved from the request by requireCapability. */
export type Target =
  | { kind: 'org' }
  | { kind: 'unit'; unitId: string }
  | { kind: 'person'; userId: string; unitId?: string }
  | { kind: 'subject'; unitId?: string }
  | { kind: 'campaign'; unitId?: string }
  | { kind: 'self'; userId: string };

/**
 * How a grant was REACHED. Five of these are edges in the org graph; `support` is the sixth
 * and is not — it is DEC-114's minted grant, which belongs to no subject in the tenant
 * because the principal holding it belongs to no subject in the tenant. It is a member of
 * this union rather than a special case beside it so that every reader of a decision trace —
 * the simulator, the audit log, `<DecisionTrace>` — explains a support refusal without ever
 * being taught that support exists.
 */
export type Via = 'person' | 'position' | 'role' | 'group' | 'delegation' | 'support';

/** A grant plus the unit it was reached THROUGH. The anchor is the crux of INV-005. */
export type CandidateGrant = {
  grantId: string;
  capability: string;
  scope: Scope;
  effect: Effect;
  params: Record<string, number>;
  via: Via;
  subjectName: string;
  /** The unit of the POSITION the grant was reached through. Undefined = whole org. */
  anchorUnitId?: string;
  anchorUnitName?: string;
  /** Role level of the anchoring position, for tie-breaking. Lower = more senior. */
  level?: number;
  validFrom: Date;
  validTo?: Date;
};

export type DecisionReason =
  | 'granted'
  | 'explicit_deny'
  | 'out_of_scope'
  | 'expired'
  | 'no_grant';

export type Decision = {
  allowed: boolean;
  capability: Capability;
  reason: DecisionReason;
  decidedBy?: {
    grantId: string;
    via: Via;
    subjectName: string;
    scope: Scope;
    anchorUnitId?: string;
    anchorUnitName?: string;
    effect: Effect;
  };
  params?: Record<string, number>;
  /**
   * The difference between a usable simulator and a useless one. "Blocked" teaches
   * nothing; "on Night Bus he is an Editor, his Director powers apply only on Ayaan"
   * teaches the whole model in one sentence.
   *
   * Returned to clients ONLY for simulator.run and for 403s outside production —
   * actionable, without letting an outsider map the org's structure.
   */
  considered: Array<{
    grantId: string;
    via: string;
    scope: string;
    effect: string;
    rejectedBecause?: string;
  }>;
};
