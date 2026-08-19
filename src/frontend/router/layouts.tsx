// Three layouts, one per world (20 §1).
//
// Three components rather than one shell with conditionals. A shell that renders
// differently for three audiences accumulates `if`s until nobody can say what a
// respondent actually sees — and that is a privacy risk, not only a code smell.
import { Link, NavLink, Outlet } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.js';
import { RequireSession } from './guards.js';

/** Marketing chrome: brand, two links, one button (20 §1). Nothing else earns its place. */
export function PublicLayout(): JSX.Element {
  return (
    <>
      <nav className="nav">
        <Link className="nav-brand" to="/">Endur</Link>
        <NavLink to="/login">Sign in</NavLink>
        <Link className="btn btn-primary" to="/start">Create organization</Link>
      </nav>
      <Outlet />
    </>
  );
}

/**
 * The console frame. The session gate is OUTSIDE the shell on purpose: a signed-out user
 * should never see chrome flash before the redirect, and the boot hold should not render a
 * sidebar with nobody's name in it.
 */
export function ConsoleLayout(): JSX.Element {
  return (
    <RequireSession>
      <AppShell>
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
