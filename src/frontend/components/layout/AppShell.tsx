// Top bar + sidebar + content well. Console world ONLY (20 §1). 24 §2.
//
// Built before any page and handed from lane B to lane C — everything in Stage 4 renders
// inside this, so it shipping late blocks two people rather than one.
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { AmbientBackground } from '../AmbientBackground.js';
import { PlanNoticeBanner } from '../billing/PlanNoticeBanner.js';
import { SupportBanner } from './SupportBanner.js';
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

      {/* DEC-114. ABOVE THE TOP BAR, and it renders nothing on every ordinary session.
          `<PlanNoticeBanner>` below is inside the content well because it is a fact about the
          ORGANISATION and belongs with the organisation's pages; this is a fact about the
          SESSION — everything under it, the navigation included, is being operated by
          somebody who does not work here — so it sits outside the frame it describes.

          NOT GATED ON `focused`. The setup wizard hides the sidebar because every item leads
          somewhere empty; there is no version of "a stranger is signed in to your account"
          that is worth hiding to keep a screen tidy. */}
      <SupportBanner />

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
          {/* THE PLAN NOTICE, ON EVERY CONSOLE PAGE — DEC-113, `16` §7d, and the same argument
              `<OverLimitBanner>` is in this file for (`16` §6). An expiry the customer only
              meets by navigating to `/app/plan` is an expiry they meet as an unexplained 402
              on a screen they were using. It renders nothing in the ordinary case and nothing
              at all without `billing.read`.

              OUTSIDE the keyed wrapper below: it is not part of the page, and remounting it on
              every navigation would refetch the summary each time and flash the strip. */}
          {!focused && <PlanNoticeBanner />}

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
