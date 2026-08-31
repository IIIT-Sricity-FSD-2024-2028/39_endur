// Three layouts, one per world (20 §1).
//
// Three components rather than one shell with conditionals. A shell that renders
// differently for three audiences accumulates `if`s until nobody can say what a
// respondent actually sees — and that is a privacy risk, not only a code smell.
import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RequirePlatformAuth, RequireSession, SessionLoading } from './guards.js';
import { AmbientBackground } from '../components/AmbientBackground.js';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { opsSignedOut } from '../store/opsSlice.js';
import { opsPost } from '../lib/ops.js';
import { useOpsCan } from '../lib/opsCapabilities.js';
import { useBootOpsSession } from '../lib/opsSession.js';

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
 * `/ops`'s own chrome — took the console's glass and ambient field (`DEC-078`, amending `70`
 * § Design note's original "plainer than the customer console"). NO `<VocabularyChips>`, NO
 * `useLabels()` — this surface still says "Organizations", "Plan", "Tier" outright (`19`
 * §12); that half of the old note was never about visual weight and still stands.
 *
 * `/ops/login` is OUTSIDE the guard, the same way `/login` is outside `RequireSession` — but
 * here it is one path INSIDE this layout rather than a separate top-level tree, because the
 * route table nests it under `/ops` (`Mithil/plan.md` Step 0.3). Checked by pathname, the
 * same device `PublicLayout` already uses for its own form-only screens.
 */
export function OpsLayout(): JSX.Element {
  const { pathname } = useLocation();
  useBootOpsSession();
  const operator = useAppSelector((s) => s.ops.operator);
  const can = useOpsCan();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  if (pathname === '/ops/login') {
    return (
      <div className="ops-shell">
        <AmbientBackground />
        <Outlet />
      </div>
    );
  }

  const signOut = (): void => {
    void opsPost('/auth/logout').finally(() => {
      dispatch(opsSignedOut());
      navigate('/ops/login', { replace: true });
    });
  };

  return (
    <RequirePlatformAuth>
      <div className="ops-shell">
        {/* Same quieter variant `/app` uses — the console is where work happens, and this is
            too, even though it is a different console (`AppShell`'s reasoning, reused). */}
        <AmbientBackground />
        <nav className="nav ops-nav glass glass-lit">
          <Link className="nav-brand" to="/ops">
            <span className="nav-mark" aria-hidden="true" />
            Endur
          </Link>
          <NavLink to="/ops" end>Estate</NavLink>
          {/* Absent for `staff`, not disabled — `70` § Acceptance. */}
          {can('platform.analytics.read') && <NavLink to="/ops/analytics">Analytics</NavLink>}
          {/* DEC-080. Its own capability, not analytics' — the two answer different
              questions and only one of them is about money. */}
          {can('platform.revenue.read') && <NavLink to="/ops/earnings">Earning</NavLink>}
          {can('platform.logs.read') && <NavLink to="/ops/logs">Logs</NavLink>}
          <span className="ops-nav-spacer" />
          {operator && <span className="text-meta">{operator.name}</span>}
          <button type="button" className="btn btn-secondary" onClick={signOut}>
            Sign out
          </button>
        </nav>
        <main className="ops-main">
          <Outlet />
        </main>
      </div>
    </RequirePlatformAuth>
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
