import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RequirePlatformAuth, RequireSession, SessionLoading } from './guards.js';
import { AmbientBackground } from '../components/AmbientBackground.js';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { opsSignedOut } from '../store/opsSlice.js';
import { opsPost } from '../lib/ops.js';
import { useOpsCan } from '../lib/opsCapabilities.js';
import { useBootOpsSession } from '../lib/opsSession.js';

const AppShell = lazy(() =>
  import('../components/layout/AppShell.js').then((module) => ({ default: module.AppShell })),
);

const ThemeToggle = lazy(() =>
  import('../components/ThemeToggle.js').then((module) => ({ default: module.ThemeToggle })),
);

const FORM_ONLY = new Set(['/login', '/start']);

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

export function ConsoleLayout(): JSX.Element {
  const { pathname } = useLocation();
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
