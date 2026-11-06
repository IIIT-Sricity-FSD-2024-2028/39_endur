// Asks before unsaved edits are thrown away: closing or reloading the tab, and leaving the
// page inside the app.
//
// The in-app half needs a data router (`useBlocker`). The app has one (`createBrowserRouter`);
// a component rendered under a plain <MemoryRouter> — most page tests — does not, and there
// the guard keeps only the tab half rather than throwing.
import { useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { ConfirmDialog } from './ConfirmDialog.js';

export function LeaveGuard({ when, what }: {
  /** True while there is something unsaved. */
  when: boolean;
  /** What would be lost, in a phrase: "your changes to the organisation". */
  what: string;
}): JSX.Element | null {
  useEffect(() => {
    if (!when) return undefined;
    const warn = (event: BeforeUnloadEvent): void => {
      // The browser shows its own wording; this only asks it to ask.
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [when]);

  const dataRouter = useContext(UNSAFE_DataRouterContext);
  return dataRouter ? <InAppGuard when={when} what={what} /> : null;
}

function InAppGuard({ when, what }: { when: boolean; what: string }): JSX.Element | null {
  // A different PAGE only: a hash on the same page (the #words link) loses nothing.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );
  if (blocker.state !== 'blocked') return null;
  return (
    <ConfirmDialog
      title="Leave without saving?"
      consequence={`You have not saved ${what}. Leaving this page now throws them away.`}
      verb="Leave without saving"
      destructive
      onCancel={() => blocker.reset()}
      onConfirm={() => blocker.proceed()}
    />
  );
}
