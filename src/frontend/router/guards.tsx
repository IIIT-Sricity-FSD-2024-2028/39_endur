// Route guards. 20 §5-6.
//
// These are USABILITY, NEVER ENFORCEMENT (INV-003). Removing every guard in this file
// would expose no data: the API decides authorisation on every route through
// requireCapability(), and returns only what the caller may see. What these prevent is a
// signed-out user staring at an empty console wondering why nothing loads.
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Capability } from '@endur/shared';
import { useAppSelector } from '../store/index.js';
import { useCan } from '../lib/capabilities.js';

/** Boot has not answered yet. A full-page hold, NOT a login screen — flashing /login at
 *  someone who is already signed in is the single worst first impression an SPA can make
 *  (20 §5). */
export function SessionLoading(): JSX.Element {
  return (
    <div className="fullpage">
      <div>
        <p className="text-muted" aria-live="polite">Loading…</p>
      </div>
    </div>
  );
}

export function RequireSession({ children }: { children?: ReactNode }): JSX.Element {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();

  if (status === 'unknown') return <SessionLoading />;
  if (status === 'anonymous') {
    // Carry where they were going, so signing in returns them there rather than dumping
    // them on the home page.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children ?? <Outlet />}</>;
}

/**
 * The ONE place a permission is allowed to produce a full-page state.
 *
 * Everywhere else, out-of-scope data is ABSENT rather than greyed out — no "you don't
 * have permission" ghosts in lists (design_specs/design/02 §5). The exception exists
 * because a directly-navigated URL has nothing to hide: the person typed it, and telling
 * them nothing would just look broken.
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children?: ReactNode;
}): JSX.Element {
  const can = useCan();
  if (!can(capability)) {
    return (
      <div className="fullpage">
        <div>
          <h3>You do not have access to this</h3>
          <p className="text-muted">
            Your account cannot open this page. Whoever administers your organisation can
            change that.
          </p>
        </div>
      </div>
    );
  }
  return <>{children ?? <Outlet />}</>;
}
