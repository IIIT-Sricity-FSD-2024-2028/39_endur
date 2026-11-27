// The operator console's frame (R-716): a rail on the left with the console's sections, the
// operator who is signed in, the theme and "Sign out"; below 900px the rail becomes a drawer.
//
// Nothing here is component state. The drawer is `state.chrome.drawerOpen` (the same flag
// the customer console's drawer uses: the two consoles are never on screen together), the
// operator and their capabilities are `state.ops`, and the Enterprise queue's count beside
// "Organizations" is the queue's cache entry.
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { PlatformCapability } from '@endur/shared';
import '../../design-system/ops.css';
import { AmbientBackground } from '../AmbientBackground.js';
import { Icon, type IconName } from '../Icon.js';
import { ThemeToggle } from '../ThemeToggle.js';
import { ToastHost } from '../feedback/ToastHost.js';
import { useOpsCan } from '../../lib/opsCapabilities.js';
import { useEnterpriseQueue } from '../../lib/estate.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { drawerClosed, drawerOpened, selectDrawerOpen } from '../../store/screens/chrome.js';
import { operatorSignedOut } from '../../store/screens/operator.js';

type Item = { to: string; label: string; icon: IconName; needs?: PlatformCapability; end?: boolean };

const GROUPS: Array<{ heading: string; items: Item[] }> = [
  {
    heading: 'Estate',
    items: [
      { to: '/ops', label: 'Organizations', icon: 'organization', needs: 'platform.org.read', end: true },
      { to: '/ops/support', label: 'Support visits', icon: 'support', needs: 'platform.support.read' },
    ],
  },
  {
    heading: 'Business',
    items: [
      { to: '/ops/analytics', label: 'Analytics', icon: 'analytics', needs: 'platform.analytics.read' },
      { to: '/ops/earnings', label: 'Earnings', icon: 'earnings', needs: 'platform.revenue.read' },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { to: '/ops/audit', label: 'Audit trail', icon: 'audit', needs: 'platform.audit.read' },
      { to: '/ops/team', label: 'Team', icon: 'team', needs: 'platform.operator.manage' },
      { to: '/ops/logs', label: 'Logs', icon: 'log', needs: 'platform.logs.read' },
    ],
  },
];

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

function OpsNav({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const can = useOpsCan();
  const operator = useAppSelector((state) => state.ops.operator);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  // Waiting on somebody: the count beside Organizations. Not asked for without the right.
  const queue = useEnterpriseQueue(can('platform.enterprise.read'));

  const signOut = (): void => {
    void dispatch(operatorSignedOut()).then(() => navigate('/ops/login', { replace: true }));
  };

  return (
    <nav className="ops-nav" aria-label="Operator console">
      <Link className="ops-brand" to="/ops" onClick={onNavigate}>
        <span className="nav-mark" aria-hidden="true" />
        Endur
        <span className="ops-brand-tag">Operator</span>
      </Link>

      {GROUPS.map((group) => {
        // ABSENT, NOT DISABLED, without the capability (`70` § Acceptance).
        const items = group.items.filter((item) => !item.needs || can(item.needs));
        if (items.length === 0) return null;
        return (
          <div className="ops-nav-group" key={group.heading}>
            <p className="utility ops-nav-heading">{group.heading}</p>
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) => `ops-nav-link${isActive ? ' is-active' : ''}`}
                onClick={onNavigate}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
                {item.to === '/ops' && queue.rows.length > 0 && (
                  <>
                    <span className="ops-nav-count" aria-hidden="true">{queue.rows.length}</span>
                    <span className="sr-only">, {queue.rows.length} asking about Enterprise</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        );
      })}

      <div className="ops-nav-foot">
        {operator && (
          <div className="ops-me">
            <span className="ops-avatar" aria-hidden="true">{initials(operator.name)}</span>
            <span>
              <span className="ops-me-name">{operator.name}</span>
              <span className="ops-me-mail">
                {operator.role === 'owner' ? 'Owner' : 'Staff'} · {operator.email}
              </span>
            </span>
          </div>
        )}
        <ThemeToggle />
        <button type="button" className="btn btn-secondary" onClick={signOut}>
          <Icon name="sign-out" size={16} />
          Sign out
        </button>
      </div>
    </nav>
  );
}

export function OpsShell({ children }: { children: ReactNode }): JSX.Element {
  const dispatch = useAppDispatch();
  const drawerOpen = useAppSelector(selectDrawerOpen);
  const { pathname } = useLocation();

  // Effect (router): the route changing under the drawer closes it.
  useEffect(() => {
    dispatch(drawerClosed());
  }, [dispatch, pathname]);

  // Effect (DOM): Escape closes the open drawer.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dispatch(drawerClosed());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch, drawerOpen]);

  return (
    <div className="ops-shell">
      <AmbientBackground />
      <a className="skip-link" href="#ops-main">Skip to content</a>

      <aside className="ops-rail">
        <OpsNav />
      </aside>

      <div>
        <header className="ops-topbar">
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => dispatch(drawerOpened())}
            aria-label="Open navigation"
          >
            <Icon name="menu" size={20} />
          </button>
          <Link className="ops-brand" to="/ops">
            <span className="nav-mark" aria-hidden="true" />
            Endur
            <span className="ops-brand-tag">Operator</span>
          </Link>
        </header>

        {drawerOpen && (
          <div className="ops-drawer-backdrop" onClick={() => dispatch(drawerClosed())}>
            <div
              className="ops-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              onClick={(event) => event.stopPropagation()}
            >
              <OpsNav onNavigate={() => dispatch(drawerClosed())} />
            </div>
          </div>
        )}

        <main id="ops-main" className="ops-main">
          {/* Keyed on the path: one enter animation per page (endur.css "page enter"). */}
          <div key={pathname} className="ops-page page-enter">
            {children}
          </div>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
