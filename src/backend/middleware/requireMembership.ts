// Link 10c — the respondent gate. 12 §4.10c, DEC-037, 15 §3.
//
// The thinnest gate in the product, and deliberately so. It asks ONE question:
//
//     is this caller signed in to THIS campaign's organisation?
//
// No grant is resolved. No capability is required. Holding more powers buys nothing here
// and gets you no second submission. A dean and a first-year answer the same form on the
// same terms, which is the only defensible reading of "only our own people can answer".
//
// MEMBERSHIP IS CHECKED AT THE GATE; IDENTITY IS DISCARDED AT THE DOOR. That sentence is
// the whole design (15 §3). It is what lets an organisation restrict a form without the
// product learning who said what — the answer stays anonymous (INV-006, and it is a schema
// property so there is nothing here to respect or forget), while participation does not.
//
// ORDER IS THE SECURITY PROPERTY. This runs after the token has been resolved, never
// before: see features/public/resolve.ts. Every invalid, unlaunched, not-yet-open, closed
// and expired token 404s before `access` is consulted, so the 401 below is reachable only
// with a working token and therefore discloses nothing that token did not.
import type { RequestHandler } from 'express';
import { NotAMemberError, SignInRequiredError } from '../lib/errors.js';
import { campaignOf } from '../features/public/resolve.js';

export const requireMembership: RequestHandler = (req, _res, next) => {
  const campaign = campaignOf(req);

  // The default and the demo path. A public campaign asks nothing of the caller — DEC-009
  // is untouched for every campaign that has not opted out of it.
  if (campaign.access !== 'organization') return next();

  const principal = req.ctx.principal;

  // An apiKey principal is not a member either. Only a person holding a staff session for
  // this organisation gets in, which is what "our own people" means.
  if (principal?.kind !== 'user') {
    return next(new SignInRequiredError(campaign.org.name));
  }
  // DEC-114. AN ENDUR OPERATOR IS NOT ONE OF "OUR OWN PEOPLE", and this is the one place in
  // the product where holding every capability is beside the point.
  //
  // A support session resolves as a member of this organisation for every other purpose,
  // which is the whole design — but the question this gate asks is not "may you" and cannot
  // be answered by a grant. It asks whether the caller is a person whose opinion this
  // campaign was collecting, and an operator who came in to fix a bug is not. Letting one
  // through would put an Endur employee's answers in a customer's results, permanently and
  // anonymously, with no column anywhere that could ever identify them for removal (INV-006
  // cuts both ways). It would also burn the one submission a real member is allowed, if the
  // synthetic account were ever swept into an audience.
  if (principal.support) {
    return next(new NotAMemberError(campaign.org.name));
  }
  if (principal.orgId !== campaign.orgId) {
    return next(new NotAMemberError(campaign.org.name));
  }

  next();
};

/**
 * The member behind an `organization` submission, or null on a public one.
 *
 * Read at the point of writing the `campaign_participants` row and NOWHERE ELSE. Anything
 * that reaches for this to decide what to store on `responses` is a bug: that table has no
 * column to store it in, and adding one is the single migration that would undo INV-006.
 */
export function memberOf(req: { ctx: { principal?: { kind: string; id?: string } } }): string | null {
  const principal = req.ctx.principal;
  return principal?.kind === 'user' && principal.id ? principal.id : null;
}
