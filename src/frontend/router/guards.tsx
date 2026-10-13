import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Capability } from '@endur/shared';
import { useAppSelector } from '../store/index.js';
import { useCan } from '../lib/capabilities.js';

export function SessionLoading(): JSX.Element {
  return (
    <div className="fullpage">
      <div>
        <p className="text-muted" aria-live="polite">Loading…</p>
      </div>
    </div>
  );
}

export function RedirectIfSignedIn({ children }: { children?: ReactNode }): JSX.Element {
  const status = useAppSelector((s) => s.auth.status);
  if (status === 'unknown') return <SessionLoading />;
  if (status === 'authenticated') return <Navigate to="/app" replace />;
  return <>{children ?? <Outlet />}</>;
}

export function RequireSession({ children }: { children?: ReactNode }): JSX.Element {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();

  if (status === 'unknown') return <SessionLoading />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children ?? <Outlet />}</>;
}

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

export function RequirePlatformAuth({ children }: { children?: ReactNode }): JSX.Element {
  const status = useAppSelector((s) => s.ops.status);
  const location = useLocation();

  if (status === 'unknown') return <SessionLoading />;
  if (status === 'anonymous') {
    return <Navigate to="/ops/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children ?? <Outlet />}</>;
}
