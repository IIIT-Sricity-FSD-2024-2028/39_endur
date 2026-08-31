// The powers of an Endur support session. Support gets ordinary grants and goes through resolve(),
// instead of a bypass - so a deny still beats an allow and the audit log explains it like any other action.
import { CAPABILITIES, supportDeniedFor, type PlatformRole } from '@endur/shared';
import type { CandidateGrant } from './types.js';

// Makes an obviously fake grant id such as support:deny:results.read, so nobody hunts for a row that does not exist.
const idFor = (effect: 'allow' | 'deny', capability: string): string =>
  `support:${effect}:${capability}`;

// Named per role, because this string is what the customer's own audit log shows them as the
// deciding grant - "Endur owner session" and "Endur support session" are different facts.
const SUBJECT_NAME: Record<PlatformRole, string> = {
  owner: 'Endur owner session',
  staff: 'Endur support session',
};

// Every capability at 'all' scope, plus real deny grants for the blocked ones, so a refusal reads "blocked by design".
// WHICH ones are blocked depends on the platform role (DEC-115): an Endur OWNER is blocked from nothing, a staff
// operator still cannot read a line of feedback. Both go through the resolver, so neither is a bypass.
export function mintSupportGrants(validTo: Date, role: PlatformRole): CandidateGrant[] {
  // Valid from epoch, not "now", so clock skew cannot make a fresh grant look invalid; the expiry is the real limit.
  const validFrom = new Date(0);

  const grants: CandidateGrant[] = CAPABILITIES.map((capability) => ({
    grantId: idFor('allow', capability),
    capability,
    scope: 'all',
    effect: 'allow',
    params: {},
    via: 'support',
    subjectName: SUBJECT_NAME[role],
    validFrom,
    validTo,
  }));

  for (const capability of supportDeniedFor(role)) {
    grants.push({
      grantId: idFor('deny', capability),
      capability,
      scope: 'all',
      effect: 'deny',
      params: {},
      via: 'support',
      subjectName: SUBJECT_NAME[role],
      validFrom,
      validTo,
    });
  }

  return grants;
}
