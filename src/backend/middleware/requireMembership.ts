// Link 10c. The gate for campaigns marked "our own people only". It asks one question:
// is this caller signed in to THIS campaign's organisation? No capability is involved,
// so a dean and a first-year answer on exactly the same terms, and the answer stays anonymous.
import type { RequestHandler } from 'express';
import { NotAMemberError, SignInRequiredError } from '../lib/errors.js';
import { campaignOf } from '../features/public/resolve.js';

export const requireMembership: RequestHandler = (req, _res, next) => {
  const campaign = campaignOf(req);

  // A public campaign asks nothing of the caller, which is the normal case.
  if (campaign.access !== 'organization') return next();

  const principal = req.ctx.principal;

  // Only a person with a staff session counts as a member; an API key does not.
  if (principal?.kind !== 'user') {
    return next(new SignInRequiredError(campaign.org.name));
  }
  // An Endur support operator is not "our own people", so they may not submit an answer.
  if (principal.support) {
    return next(new NotAMemberError(campaign.org.name));
  }
  if (principal.orgId !== campaign.orgId) {
    return next(new NotAMemberError(campaign.org.name));
  }

  next();
};

// The member behind a members-only submission, or null on a public one.
// Used ONLY to record participation, and never stored against the response itself.
export function memberOf(req: { ctx: { principal?: { kind: string; id?: string } } }): string | null {
  const principal = req.ctx.principal;
  return principal?.kind === 'user' && principal.id ? principal.id : null;
}
