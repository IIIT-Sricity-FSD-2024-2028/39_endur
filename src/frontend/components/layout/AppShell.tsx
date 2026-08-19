// Top bar + sidebar + content well. Console world ONLY (20 §1). 24 §2.
//
// Built before any page and handed from lane B to lane C — everything in Stage 4 renders
// inside this, so it shipping late blocks two people rather than one.
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
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
      {/* First focusable element on the page. 26 — and it is cheap now, expensive later. */}
      <a className="skip-link" href="#main">Skip to content</a>

      <TopBar onOpenMenu={() => setDrawerOpen(true)} />

      <div className="shell-body">
        {/* Desktop: a column. Below 640px this is hidden and the drawer takes over. */}
        <div className="shell-rail">
          <Sidebar />
        </div>

        {drawerOpen && (
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
          <div className="page">{children}</div>
        </main>
      </div>
    </div>
  );
}
