// The shared types the permission resolver speaks in.
import type { Capability, Effect, Scope } from '@endur/shared';

// What is being asked about: the whole org, a unit, a person, a subject, a campaign, or yourself.
export type Target =
  | { kind: 'org' }
  | { kind: 'unit'; unitId: string }
  | { kind: 'person'; userId: string; unitId?: string }
  | { kind: 'subject'; unitId?: string }
  | { kind: 'campaign'; unitId?: string }
  | { kind: 'self'; userId: string };

// How a grant reached the person: through themselves, a position, a role, a group, a delegation, or support access.
export type Via = 'person' | 'position' | 'role' | 'group' | 'delegation' | 'support';

// One grant that might apply, plus the unit it was reached through.
export type CandidateGrant = {
  grantId: string;
  capability: string;
  scope: Scope;
  effect: Effect;
  params: Record<string, number>;
  via: Via;
  subjectName: string;
  // Unit of the position the grant came through. Empty means it covers the whole org.
  anchorUnitId?: string;
  anchorUnitName?: string;
  // Role level of that position, used to break ties. Lower number = more senior.
  level?: number;
  validFrom: Date;
  validTo?: Date;
};

// Why a decision came out the way it did.
export type DecisionReason =
  | 'granted'
  | 'explicit_deny'
  | 'out_of_scope'
  | 'expired'
  | 'no_grant';

// The final answer for one permission check, plus the reasoning behind it.
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
  // The grants that were looked at and why each was rejected - this is what makes the simulator useful.
  considered: Array<{
    grantId: string;
    via: string;
    scope: string;
    effect: string;
    rejectedBecause?: string;
  }>;
};
