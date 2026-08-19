// Three layouts, one per world (20 §1).
//
// Three components rather than one shell with conditionals. A shell that renders
// differently for three audiences accumulates `if`s until nobody can say what a
// respondent actually sees — and that is a privacy risk, not only a code smell.
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { RequireSession } from './guards.js';

/** The two screens that are a form and nothing else (design_specs/design/03 §3.2, §3.3). */
const FORM_ONLY = new Set(['/login', '/start']);

/**
 * Marketing chrome: brand, one link, one button (20 §1). Nothing else earns its place.
 *
 * On `/login` and `/start` even that goes away and only the brand remains. The mockups
 * draw those two as a centred card under a bare wordmark, and the reason is not
 * decoration: a "Create organization" button beside a sign-in form is an invitation to
 * make a second organisation by accident, and the way back is already inside the card.
 */
export function PublicLayout(): JSX.Element {
  const { pathname } = useLocation();
  const formOnly = FORM_ONLY.has(pathname);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="nav">
        <Link className="nav-brand" to="/">
          <span className="nav-mark" aria-hidden="true" />
          Endur
        </Link>
        {!formOnly && (
          <>
            <NavLink to="/login">Sign in</NavLink>
            <Link className="btn btn-primary" to="/start">Create organization</Link>
          </>
        )}
      </nav>
      <main id="main" className={formOnly ? 'public-main public-main-form' : 'public-main'}>
        <Outlet />
      </main>
    </>
  );
}

/**
 * The console frame. The session gate is OUTSIDE the shell on purpose: a signed-out user
 * should never see chrome flash before the redirect, and the boot hold should not render a
 * sidebar with nobody's name in it.
 */
export function ConsoleLayout(): JSX.Element {
  const { pathname } = useLocation();
  // The wizard gets the focused frame (design_specs/design/03 §3.4). The decision lives
  // here rather than inside AppShell so the shell stays a dumb frame and the route that
  // wants something different says so out loud.
  const focused = pathname === '/app/setup';

  return (
    <RequireSession>
      <AppShell focused={focused}>
        <Outlet />
      </AppShell>
    </RequireSession>
  );
}

/**
 * NO CHROME AT ALL, and that is the design (DEC-009). A hotel guest scanning a QR on a
 * table card must never see a login screen, a sidebar, or a link into a product they have
 * no account for. There is no session here and there never will be.
 */
export function RespondLayout(): JSX.Element {
  return (
    <main className="page page-form">
      <Outlet />
    </main>
  );
}
