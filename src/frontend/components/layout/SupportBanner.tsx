// SOMEBODY FROM ENDUR IS DRIVING THIS CONSOLE. DEC-114, `19` §15, `24` § Chrome.
//
// This component is not decoration on the support feature — it is most of the reason the
// feature was buildable at all. `19` §14 refused operator impersonation, and what it actually
// refused was an operator inside a customer's account INVISIBLY. Everything else about that
// row's objection is answered by `SUPPORT_DENIED_CAPABILITIES`; this answers the rest.
//
// IT RENDERS FOR BOTH SIDES, AND THAT COST A REWRITE TO GET RIGHT. The first version read the
// caller's own session, so the only person who ever saw the disclosure was the operator it was
// disclosing — a promise legible exclusively to the person being watched. `SupportContext`
// carries `viewer` now, and `/auth/me` answers it for a customer's staff as well, from a live
// row rather than from their session. Two audiences, one component, because they are the same
// fact told to two people and two components would be two places for the words to drift.
//
// IT CANNOT BE DISMISSED, AND THERE IS NO SETTING THAT HIDES IT. A banner with a close button
// is a banner that is absent for the whole of the second visit, which is the state the customer
// must never be in. It costs a strip of screen for an hour a year and buys the only honest
// version of the feature.
//
// IT SITS ABOVE THE TOP BAR, not in the content well where `<PlanNoticeBanner>` lives, and the
// difference is what each one is about. A plan notice is a fact about the organisation and
// belongs with the organisation's pages. This is a fact about THE SESSION ITSELF — every pixel
// below it, the navigation included, is being operated by somebody who does not work here — so
// it has to sit outside the frame it is describing.
import { useEffect, useState } from 'react';
import type { SupportContext } from '@endur/shared';
import { useAppSelector } from '../../store/index.js';
import { Icon } from '../Icon.js';
// THE OPS CLIENT, FROM A CONSOLE COMPONENT, and the layering smell is worth one comment. Leave
// is a route under `/api/v1/platform`: it takes no CSRF token (the `endur.ops` cookie's
// `sameSite: 'lax'` is the control there, `19` §9) and a 401 from it must not dispatch
// `signedOut` on the org slice. `lib/api.ts` gets both of those wrong for this one call, which
// is precisely why `lib/ops.ts` exists as a separate client rather than as a flag.
import { opsPost } from '../../lib/ops.js';

/**
 * Whole minutes left, floored, never below zero.
 *
 * FLOORED RATHER THAN ROUNDED, so "1 minute left" never means ninety seconds. This number is
 * the customer's warning that a stranger is about to lose access to their account, and the
 * honest direction to be wrong in is early.
 */
export function minutesLeft(expiresAt: string, now: Date = new Date()): number {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.floor(remaining / 60_000);
}

/** "42 minutes", "1 minute", "less than a minute". No bare integers loose in a sentence. */
function remainingWords(minutes: number): string {
  if (minutes <= 0) return 'less than a minute';
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function SupportBanner(): JSX.Element | null {
  const support = useAppSelector((s) => s.auth.support);
  return support ? <Strip support={support} /> : null;
}

/**
 * SPLIT OUT SO THE TIMER IS ONLY MOUNTED WHEN THERE IS SOMETHING TO COUNT.
 *
 * Hooks cannot be called conditionally, so one component would have to run an interval on every
 * console page in the product for the sake of a strip almost nobody sees. An early return in
 * the parent with the state down here is the shape `<PlanNoticeBanner>` uses, for the same
 * reason.
 */
function Strip({ support }: { support: SupportContext }): JSX.Element {
  const [minutes, setMinutes] = useState(() => minutesLeft(support.expiresAt));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // THIRTY SECONDS, not sixty. The number shown is in whole minutes, so a per-minute tick
    // would be right only half the time — it would sit on "12 minutes" for up to 119 seconds
    // depending on when the page happened to load. Sampling twice per displayed unit keeps the
    // strip within thirty seconds of the truth without a timer anybody would notice.
    const timer = window.setInterval(() => setMinutes(minutesLeft(support.expiresAt)), 30_000);
    return () => window.clearInterval(timer);
  }, [support.expiresAt]);

  /**
   * A FULL PAGE NAVIGATION AFTERWARDS, and it goes to `/ops` rather than `/login`.
   *
   * The response has just destroyed the org session and cleared both its cookies, so this store
   * now describes a session that no longer exists; a client-side route change would carry the
   * stale org and capability set into whatever rendered next. Reloading discards it. `/ops` is
   * the honest destination because the operator's own `endur.ops` cookie is untouched — it is a
   * different cookie on a different path — so they land back where they came from rather than
   * on a customer's sign-in page.
   */
  const leave = (): void => {
    setLeaving(true);
    void opsPost('/support-session/leave', {})
      .then(() => window.location.assign('/ops'))
      // Even a failure means going back: the row is ended before anything else in
      // `leaveSupport`, so if this call reached the server at all the access is already gone,
      // and if it did not, `/ops` is still where the operator wants to be.
      .catch(() => window.location.assign('/ops'));
  };

  const operator = support.viewer === 'operator';

  return (
    <div className="support-banner" role="status">
      {/* THE REASON, VISIBLE ON ITS OWN — THE ONE LINE THE VISIBLE-CHROME REQUEST KEPT. It is the
          operator's own words, typed knowing the customer would read them; nothing else on the
          strip needs to be sighted to do its job. */}
      <p className="support-banner-reason">“{support.reason}”</p>
      {/* THE REST OF THE SENTENCE STILL EXISTS FOR SCREEN READERS, EVEN THOUGH THE STRIP NO
          LONGER PRINTS IT VISIBLY. `role="status"` announces this text on mount for assistive
          tech; the disclosure this component exists to make is not allowed to become inaudible
          just because it stopped being sighted. */}
      <p className="sr-only">
        {operator ? (
          <>
            Support session. You are signed in to this organisation as yourself, and they can see
            that you are.
          </>
        ) : (
          <>{support.operatorName} from Endur support is signed in to your organisation.</>
        )}{' '}
        {operator
          ? 'Responses, results and check-in notes are closed to you.'
          : 'Responses, results and check-in notes stay closed to them.'}
      </p>
      <span className="support-banner-countdown" title={`${remainingWords(minutes)} left`}>
        <Icon name="countdown" size={16} />
        <span aria-hidden="true">{remainingWords(minutes)} left</span>
        <span className="sr-only">Access ends automatically in {remainingWords(minutes)}.</span>
      </span>
      {/* ONLY THE OPERATOR GETS THE BUTTON, and a customer having no way to eject them is a
          deliberate limit rather than an oversight. Ending somebody else's session is an action
          with a target, which means it is a capability question — and inventing
          `support.revoke` would put a customer's staff in the position of cutting off the
          person mid-fix, on the one screen where the fix is happening. The hour is the control
          the customer has, and it is on the strip beside this. */}
      {operator && (
        <button type="button" className="btn btn-secondary btn-sm support-banner-leave" onClick={leave} disabled={leaving}>
          {leaving ? 'Leaving…' : 'Leave'}
        </button>
      )}
    </div>
  );
}
