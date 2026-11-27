import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { RequirePlatformAuth, RequireSession, SessionLoading } from './guards.js';
import { AmbientBackground } from '../components/AmbientBackground.js';
import { ToastHost } from '../components/feedback/ToastHost.js';
import { useBootOpsSession } from '../lib/opsSession.js';

const AppShell = lazy(() =>
  import('../components/layout/AppShell.js').then((module) => ({ default: module.AppShell })),
);

const OpsShell = lazy(() =>
  import('../components/platform/OpsShell.js').then((module) => ({ default: module.OpsShell })),
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
      {/* The console's one toast (R-307). Pages dispatch `toastShown`; this draws it. */}
      <ToastHost />
    </RequireSession>
  );
}

export function OpsLayout(): JSX.Element {
  const { pathname } = useLocation();
  useBootOpsSession();

  // The sign-in page draws its own frame (and loads the console's styles itself).
  if (pathname === '/ops/login') {
    return (
      <>
        <AmbientBackground />
        <Outlet />
      </>
    );
  }

  // The rail, the drawer, the operator and "Sign out": `components/platform/OpsShell.tsx`,
  // in the console's own chunk with its stylesheet, so no customer ever downloads either.
  return (
    <RequirePlatformAuth>
      <Suspense fallback={<SessionLoading />}>
        <OpsShell>
          <Outlet />
        </OpsShell>
      </Suspense>
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
