// Three layouts, one per world (20 §1).
//
// Three components rather than one shell with conditionals. A shell that renders
// differently for three audiences accumulates `if`s until nobody can say what a
// respondent actually sees — and that is a privacy risk, not only a code smell.
import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { RequireSession, SessionLoading } from './guards.js';

/**
 * LAZY, and it is not a micro-optimisation — it is 20 §8's "the respondent bundle must not
 * include the console", enforced.
 *
 * This module is imported statically by `router/index.tsx`, so anything it imports lands in
 * the ENTRY chunk that every route downloads. <AppShell> pulls in the sidebar, the top bar
 * and <Icon>'s thirty lucide glyphs — and a static import put all of it on the phone of
 * somebody scanning a QR code, before the first question rendered. Measured at T-039: the
 * entry chunk carried lucide-react.
 *
 * `pages/respond/bundle.test.ts` walks the graph out of the respondent PAGES and was clean
 * while this was still wrong, which is worth remembering — the pages were never the leak.
 */
const AppShell = lazy(() =>
  import('../components/layout/AppShell.js').then((module) => ({ default: module.AppShell })),
);

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
      <Suspense fallback={<SessionLoading />}>
        <AppShell focused={focused}>
          <Outlet />
        </AppShell>
      </Suspense>
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
