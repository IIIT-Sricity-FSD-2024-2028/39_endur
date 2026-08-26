// Top bar + sidebar + content well. Console world ONLY (20 §1). 24 §2.
//
// Built before any page and handed from lane B to lane C — everything in Stage 4 renders
// inside this, so it shipping late blocks two people rather than one.
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { AmbientBackground } from '../AmbientBackground.js';
import { useAppSelector } from '../../store/index.js';

/** Industries the vibe system has a colour pair for (`endur.css` "the switch"). `custom`
 *  and anything else fall through to the base blue accent — same rule Landing.tsx follows. */
const VIBE_INDUSTRIES = new Set(['university', 'hotel', 'hospital', 'company']);

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
  const industry = useAppSelector((s) => s.auth.org?.industry ?? null);

  // Navigating closes the drawer. Without this, tapping an item on a phone leaves the
  // drawer covering the page it just opened.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Same mechanism Landing.tsx uses for the demo switcher, aimed at the signed-in org
  // instead of whichever preset a visitor is previewing: the accent the org picked at
  // setup follows them into the console, not just the marketing page they signed up from.
  useEffect(() => {
    if (industry && VIBE_INDUSTRIES.has(industry)) {
      document.documentElement.dataset.vibe = industry;
    } else {
      delete document.documentElement.dataset.vibe;
    }
    return () => {
      delete document.documentElement.dataset.vibe;
    };
  }, [industry]);

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
          {/* `key` on the pathname is what makes this an ENTER animation rather than a
              one-off on first mount: React tears the wrapper down and builds a new one per
              route, so the keyframe restarts. One animated element per navigation — the
              content inside is untouched, which is why a 400-row table costs the same as an
              empty state. See endur.css "page enter". */}
          <div
            key={location.pathname}
            className={focused ? 'page page-focused page-enter' : 'page page-enter'}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
