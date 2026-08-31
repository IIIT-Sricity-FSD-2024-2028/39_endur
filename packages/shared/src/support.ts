// SUPPORT ACCESS — the one door from Endur's console into a customer's. DEC-114, 19 §15.
//
// THE POINT, IN ONE SENTENCE: an operator's powers inside a customer's organisation are
// GRANTS, not a bypass. `db/support.ts` mints them, `authz/collect.ts` hands them to the
// resolver like any other candidate, and `requireCapability` decides every route exactly as
// it does for a real member. Nothing anywhere says `if (support) return next()`.
//
// That matters more than it sounds. A bypass is a second permission model, and a second
// permission model is a thing that drifts from the first (N-005). Expressing the operator's
// powers in the product's own vocabulary means every property the engine already has applies
// to them for free:
//
//   · INV-004 — a deny beats an allow, so the list below is INESCAPABLE rather than
//               "checked in the places we remembered"
//   · INV-007 — the audit row records WHICH grant decided it, so a support action is
//               attributable in the customer's own log
//   · `42`    — the simulator explains a support refusal the same way it explains any other
//
// WHY A DENY LIST AND NOT AN ALLOW LIST. An allow list is a thing somebody forgets to add
// to: ship a new capability, and the operator silently does not hold it — which reads as a
// bug and gets "fixed" by widening. A deny list fails the other way. Ship a new capability
// and the operator holds it; the only capabilities they do not hold are the ones somebody
// wrote down here, with a reason, in the file the reviewer opens.
import type { Capability } from './capabilities.js';

/**
 * WHAT AN ENDUR OPERATOR STILL CANNOT DO INSIDE A CUSTOMER'S CONSOLE.
 *
 * `19` §5 (INV-011) says an operator reads counts and never content. `01` §6 and `52` sell
 * that to the customer in words. A support session is a much wider door than the aggregate
 * seam, so the promise has to be restated in a form the wider door respects — which is this
 * list, resolved as `deny` grants at `all` scope.
 *
 * Three groups, and they are denied for three different reasons:
 *
 *   FEEDBACK CONTENT — the thing we promise never to read. A response body, an exported
 *   sheet of them, a results page (which renders free-text comments), the analysis built
 *   over them. This is INV-011 restated for the console.
 *
 *   PERSONAL CONTENT — a reviewee's own reflections, their action plan, and a supervisor's
 *   check-in notes. Not feedback, and denied anyway: `44` describes these as a private loop
 *   between two named people, and "Endur can read your 1:1 notes" is the same broken promise
 *   wearing a different noun.
 *
 *   IRREVERSIBLE OR FINANCIAL — deleting the organisation, and joining a tier AS the
 *   customer. Neither is a support action. The operator's own surface already has the right
 *   verb for the second (`platform.plan.override`, which takes no money and writes no
 *   payment), and there is no right verb for the first.
 *
 * TO WIDEN IT, DELETE A LINE HERE. That is deliberate: the whole enforcement is one exported
 * array, so the change is one line in one file in a diff, rather than a flag nobody reviews.
 */
export const SUPPORT_DENIED_CAPABILITIES: readonly Capability[] = [
  // Feedback content — INV-011.
  'response.read',
  'response.export',
  'results.read',
  'results.export',
  'analysis.read',
  // Personal content — 44.
  'reflection.read',
  'actionplan.read',
  'checkin.read',
  // Irreversible or financial — 19 §8.
  'org.delete',
  'billing.update',
];

const DENIED = new Set<string>(SUPPORT_DENIED_CAPABILITIES);

/** Used by the resolver's grant minter and by the banner's copy. One source, two readers. */
export const isSupportDenied = (capability: string): boolean => DENIED.has(capability);

/**
 * HOW LONG A SUPPORT SESSION LASTS BEFORE IT STOPS BY ITSELF.
 *
 * Shorter than the operator's own session (12h, `19` §7), which is itself shorter than a
 * customer's (7 days). Each step down is the same argument: the wider the door, the smaller
 * the window worth stealing. This is the widest door in the product.
 *
 * It EXPIRES rather than needing to be closed, because "remember to press Leave" is not a
 * control — the same reason a position carries `validTo` instead of a revocation reminder.
 */
export const SUPPORT_SESSION_MINUTES = 60;

/**
 * What the customer's own console is told about the session it is inside. Rendered by
 * `<SupportBanner>` on every page of `/app` (24).
 *
 * THE ORGANISATION IS TOLD, ALWAYS, AND CANNOT TURN IT OFF. An operator working invisibly
 * inside somebody's account is the version of this feature that `19` §14 refused, and the
 * banner is most of what makes this version a different thing rather than the same thing
 * with a nicer name.
 */
export type SupportContext = {
  /**
   * WHO IS READING THIS, and it is the field that made the banner honest.
   *
   * The first version of `<SupportBanner>` rendered from the CALLER's own session, which meant
   * only the operator ever saw it — a disclosure visible exclusively to the person it was
   * disclosing. The customer's session is a different session and carries no support flag, so
   * without this the banner was a self-reminder wearing the words of a promise.
   *
   *   `operator` — you are the one inside somebody else's organisation. Says so, and offers
   *                the way out.
   *   `member`   — somebody from Endur is inside YOURS. Says who, why, and until when.
   *
   * One shape and one component for both, because they are the same fact told to two people,
   * and two components would be two places for the wording to drift from what is true.
   */
  viewer: 'operator' | 'member';
  operatorName: string;
  operatorEmail: string;
  /** Why they came in. Typed at the door, stored, and shown to the customer verbatim. */
  reason: string;
  startedAt: string;
  expiresAt: string;
};
