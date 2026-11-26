import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { AmbientBackground } from '../AmbientBackground.js';
import { PlanNoticeBanner } from '../billing/PlanNoticeBanner.js';
import { SupportBanner } from './SupportBanner.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { drawerClosed, drawerOpened, selectDrawerOpen } from '../../store/screens/chrome.js';

const VIBE_INDUSTRIES = new Set(['university', 'hotel', 'hospital', 'company']);

export function AppShell({
  children,
  focused = false,
}: {
  children: ReactNode;
  focused?: boolean;
}): JSX.Element {
  // The phone drawer is `state.chrome.drawerOpen` (store/screens/chrome.ts).
  const dispatch = useAppDispatch();
  const drawerOpen = useAppSelector(selectDrawerOpen);
  const location = useLocation();
  const industry = useAppSelector((s) => s.auth.org?.industry ?? null);

  // The route changing under the drawer closes it (Back, a link elsewhere on the page): the
  // router is outside the store, and this is where its change is reported to it.
  useEffect(() => {
    dispatch(drawerClosed());
  }, [dispatch, location.pathname]);

  // Effect (DOM): the console takes the organisation's industry look (`data-vibe`).

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

  // Effect (DOM): Escape closes the open drawer.

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dispatch(drawerClosed());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch, drawerOpen]);

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

      <TopBar {...(focused ? {} : { onOpenMenu: () => dispatch(drawerOpened()) })} />

      <div className="shell-body">
        {/* Desktop: a column. Below 640px this is hidden and the drawer takes over. */}
        {!focused && (
          <div className="shell-rail">
            <Sidebar />
          </div>
        )}

        {!focused && drawerOpen && (
          <div className="drawer-backdrop" onClick={() => dispatch(drawerClosed())}>
            <div
              className="drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              onClick={(event) => event.stopPropagation()}
            >
              <Sidebar onNavigate={() => dispatch(drawerClosed())} />
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
