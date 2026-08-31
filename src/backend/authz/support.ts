// The support principal's grants. DEC-114, 19 §15.
//
// THIS FILE IS THE ARGUMENT FOR THE WHOLE FEATURE, so it is worth reading before the code.
//
// `19` §14 refused operator impersonation and gave a good reason: it is INV-011 with extra
// steps. The obvious way to build it anyway would have been a bypass —
//
//     if (req.ctx.principal.support) return next();      // <- never written, on purpose
//
// — placed in `requireCapability`. That is a SECOND permission model, and a second permission
// model drifts from the first the moment either changes (N-005 is the same objection, one
// layer down). It would also be silently total: every capability shipped afterwards would be
// held by an operator without anybody deciding that it should be.
//
// So the operator's powers are expressed in the product's own vocabulary instead. They are
// candidate grants. They go through `resolve()` unchanged, and every property the engine
// already has applies to them for free:
//
//   INV-004  a deny beats an allow, unconditionally — so the denied list below cannot be
//            escaped by choosing a different target, a different scope, or a different route
//   INV-005  irrelevant here, because scope `all` needs no anchor — but the trace still says
//            so, rather than the reader having to know it
//   INV-007  the audit row records which grant decided it, so the customer's own log
//            distinguishes "Endur support changed this" from "Endur support was refused this"
//   `42`     the simulator explains a support refusal in the same sentence shape it explains
//            every other refusal in the product
//
// The last one is the demonstration worth giving out loud: the same screen, the same engine,
// the same trace — and the deny wins because deny always wins.
import { CAPABILITIES, SUPPORT_DENIED_CAPABILITIES } from '@endur/shared';
import type { CandidateGrant } from './types.js';

/**
 * A stable, obviously-synthetic grant id. It is not a `grants` row and must never look like
 * one: an id that could be mistaken for a real uuid would send somebody hunting the powers
 * grid for a row that is not there, and `33` has no way to render or revoke this.
 *
 * The capability is in the id because `decidedBy.grantId` is what an administrator reads in
 * their audit log, and `support:deny:results.read` says the whole thing in one string.
 */
const idFor = (effect: 'allow' | 'deny', capability: string): string =>
  `support:${effect}:${capability}`;

/**
 * Everything, at `all` scope, minus the denied list — which is present as DENY grants rather
 * than as absent allows.
 *
 * WHY BOTH, FOR A DENIED CAPABILITY. Omitting the allow would be enough to refuse the
 * request; the resolver would answer `no_grant`, which is *"nobody gave you this at all"*.
 * That is the wrong sentence. `no_grant` tells an operator to go and find somebody who can
 * grant it, and there is nobody: the refusal is a deliberate limit on what Endur may see
 * inside a customer's account, and it is permanent. An explicit deny answers `explicit_deny`
 * with the grant that decided it, which is the true and actionable version — *"Endur support
 * is blocked from this, by design"* — and it is what `<DecisionTrace>` renders.
 *
 * It is also the honest demonstration of INV-004. The operator holds the allow. The deny beats
 * it anyway, because a deny always does.
 */
export function mintSupportGrants(validTo: Date): CandidateGrant[] {
  // Epoch rather than "now": a grant that begins at the instant it is minted is a grant with
  // a clock-skew failure mode, and there is nothing this window is protecting at its lower
  // end. The UPPER end is the control, and it is the session's own expiry.
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
