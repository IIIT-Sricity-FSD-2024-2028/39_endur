// The powers of an Endur support session. Support gets ordinary grants and goes through resolve(),
// instead of a bypass - so a deny still beats an allow and the audit log explains it like any other action.
import { CAPABILITIES, SUPPORT_DENIED_CAPABILITIES } from '@endur/shared';
import type { CandidateGrant } from './types.js';

// Makes an obviously fake grant id such as support:deny:results.read, so nobody hunts for a row that does not exist.
const idFor = (effect: 'allow' | 'deny', capability: string): string =>
  `support:${effect}:${capability}`;

// Every capability at 'all' scope, plus real deny grants for the blocked ones, so a refusal reads "blocked by design".
export function mintSupportGrants(validTo: Date): CandidateGrant[] {
  // Valid from epoch, not "now", so clock skew cannot make a fresh grant look invalid; the expiry is the real limit.
  const validFrom = new Date(0);

  const grants: CandidateGrant[] = CAPABILITIES.map((capability) => ({
    grantId: idFor('allow', capability),
    capability,
    scope: 'all',
    effect: 'allow',
    params: {},
    via: 'support',
    subjectName: 'Endur support session',
    validFrom,
    validTo,
  }));

  for (const capability of SUPPORT_DENIED_CAPABILITIES) {
    grants.push({
      grantId: idFor('deny', capability),
      capability,
      scope: 'all',
      effect: 'deny',
      params: {},
      via: 'support',
      subjectName: 'Endur support session',
      validFrom,
      validTo,
    });
  }

  return grants;
}
