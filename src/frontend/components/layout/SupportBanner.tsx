// The strip a support session puts above everything. Its clock and "Leaving…" are
// `state.chrome.support` (store/screens/chrome.ts); leaving is the `supportSessionLeft` thunk.
import { useEffect } from 'react';
import type { SupportContext } from '@endur/shared';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { selectSupportClock, supportClockTicked, supportSessionLeft } from '../../store/screens/chrome.js';
import { Icon } from '../Icon.js';

export function minutesLeft(expiresAt: string, now: Date = new Date()): number {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  return remaining <= 0 ? 0 : Math.floor(remaining / 60_000);
}

function remainingWords(minutes: number): string {
  if (minutes <= 0) return 'less than a minute';
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function reachOf(role: SupportContext['role'], operator: boolean): string {
  if (role === 'owner') {
    return operator
      ? 'As an Endur owner you have full access to this organization, responses and results included. Every action is recorded in their audit log under your name.'
      : 'As an Endur owner, they have full access to this organization, responses and results included. Every action is recorded in your audit log under their name.';
  }
  return operator
    ? 'Responses, results and check-in notes are closed to you.'
    : 'Responses, results and check-in notes stay closed to them.';
}

export function SupportBanner(): JSX.Element | null {
  const support = useAppSelector((s) => s.auth.support);
  return support ? <Strip support={support} /> : null;
}

function Strip({ support }: { support: SupportContext }): JSX.Element {
  const dispatch = useAppDispatch();
  const { now, leaving } = useAppSelector(selectSupportClock);
  const minutes = minutesLeft(support.expiresAt, new Date(now));

  // The clock is a timer (a resource); each tick puts the time into the store. Once on
  // mount, so a strip that appears later does not count from when the app started.
  useEffect(() => {
    dispatch(supportClockTicked());
    const timer = window.setInterval(() => dispatch(supportClockTicked()), 30_000);
    return () => window.clearInterval(timer);
  }, [dispatch]);

  // Even a failure means going back: the row is ended before anything else in
  // `leaveSupport`, so if the call reached the server at all the access is already gone, and
  // if it did not, `/ops` is still where the operator wants to be.
  const leave = (): void => {
    void dispatch(supportSessionLeft()).then(() => window.location.assign('/ops'));
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
            Support session. You are signed in to this organization as yourself, and they can see
            that you are.
          </>
        ) : (
          <>{support.operatorName} from Endur support is signed in to your organization.</>
        )}{' '}
        {reachOf(support.role, operator)}
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
