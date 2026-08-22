// Top bar + sidebar + content well. Console world ONLY (20 §1). 24 §2.
//
// Built before any page and handed from lane B to lane C — everything in Stage 4 renders
// inside this, so it shipping late blocks two people rather than one.
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { AmbientBackground } from '../AmbientBackground.js';

export function AppShell({
  children,
  focused = false,
}: {
  children: ReactNode;
  /**
   * No sidebar, no drawer, no hamburger — the frame design_specs/design/03 §3.4 draws for
   * the setup wizard. During setup every sidebar item leads to a page that is empty
   * *because setup has not happened yet*, so offering them invites the one click that
   * makes the product look broken. It is still the console: same session, same top bar,
   * same capability gate.
   */
  focused?: boolean;
}): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Navigating closes the drawer. Without this, tapping an item on a phone leaves the
  // drawer covering the page it just opened.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="shell">
      {/* Quieter than the public world's: the console is where work happens, and a
          background competing with a data table is a background in the wrong place. */}
      <AmbientBackground />

      {/* First focusable element on the page. 26 — and it is cheap now, expensive later. */}
      <a className="skip-link" href="#main">Skip to content</a>

      <TopBar {...(focused ? {} : { onOpenMenu: () => setDrawerOpen(true) })} />

      <div className="shell-body">
        {/* Desktop: a column. Below 640px this is hidden and the drawer takes over. */}
        {!focused && (
          <div className="shell-rail">
            <Sidebar />
          </div>
        )}

        {!focused && drawerOpen && (
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
            <div
              className="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              onClick={(event) => event.stopPropagation()}
            >
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}

        <main id="main" className="shell-content">
          <div className={focused ? 'page page-focused' : 'page'}>{children}</div>
        </main>
      </div>
    </div>
  );
}
