// Three layouts, one per world (20 §1).
//
// Three components rather than one shell with conditionals. A shell that renders
// differently for three audiences accumulates `if`s until nobody can say what a
// respondent actually sees — and that is a privacy risk, not only a code smell.
import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { RequireSession, SessionLoading } from './guards.js';
import { AmbientBackground } from '../components/AmbientBackground.js';

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

/**
 * LAZY FOR THE SAME REASON, and it is not obvious: <ThemeToggle> is three icons in a pill,
 * but it imports <Icon>, and <Icon> is lucide-react's thirty glyphs. Imported statically
 * here it lands in the ENTRY chunk — the one a phone downloads before it can render a
 * single question — which is precisely the leak `pages/respond/bundle.test.ts` was written
 * to catch, and which it caught again when this was added.
 *
 * <AmbientBackground> above needs none of this: it imports nothing at all.
 */
const ThemeToggle = lazy(() =>
  import('../components/ThemeToggle.js').then((module) => ({ default: module.ThemeToggle })),
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
      {/* The public world gets the ambient layer at full strength — out here it is part of
          the composition rather than something the console sits quietly on top of. */}
      <AmbientBackground variant="hero" />
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="nav nav-public glass glass-lit">
        <Link className="nav-brand" to="/">
          <span className="nav-mark" aria-hidden="true" />
          Endur
        </Link>
        {/* Appearance stays even on the form-only screens. Someone who signs in at night
            should not have to reach the console before the product stops glaring.

            No fallback: the theme itself is already applied by the inline script in
            index.html, so the only thing still loading is the CONTROL. A placeholder
            would reserve space and then swap, which is more visible than the control
            simply arriving. */}
        <Suspense fallback={null}>
          <ThemeToggle className="nav-theme" />
        </Suspense>
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
    <>
      {/* Still no chrome. The ambient layer carries no navigation, no brand and no link —
          it is the ground the form's glass needs in order to read as glass, and nothing
          more. */}
      <AmbientBackground />
      <main className="page page-form">
        <Outlet />
      </main>
    </>
  );
}
