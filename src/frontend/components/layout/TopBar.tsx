// The console's top bar. Which menu is open is `state.chrome.openMenu`
// (store/screens/chrome.ts); where the menu's panel sits is measured from the DOM and written
// to the panel through a ref, which is layout and not state (DEC-R03's ref exception).
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { ThemeToggle } from '../ThemeToggle.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { menuClosed, menuToggled, selectOpenMenu } from '../../store/screens/chrome.js';
import { useSignOut } from '../../lib/session.js';

export function TopBar({
  onOpenMenu,
}: {
  onOpenMenu?: (() => void) | undefined;
}): JSX.Element {
  const user = useAppSelector((s) => s.auth.user);
  const org = useAppSelector((s) => s.auth.org);

  return (
    <header className="topbar">
      {onOpenMenu && (
        <button
          type="button"
          className="btn btn-icon topbar-menu"
          onClick={onOpenMenu}
          aria-label="Open navigation"
        >
          <Icon name="menu" size={20} />
        </button>
      )}

      <Link to="/app" className="topbar-brand">
        <span className="topbar-mark" aria-hidden="true">E</span>
        <span>Endur</span>
      </Link>

      <span className="topbar-org">{org?.name ?? ''}</span>

      <div className="topbar-right">
        <ThemeToggle className="topbar-theme" />
        <UserChip name={user?.name ?? ''} email={user?.email ?? ''} />
      </div>
    </header>
  );
}

function UserChip({ name, email }: { name: string; email: string }): JSX.Element {
  const menu = useMenu();
  const signOut = useSignOut();
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="menu-anchor" ref={menu.anchorRef}>
      <button
        type="button"
        className="btn btn-ghost user-chip"
        onClick={menu.toggle}
        aria-expanded={menu.open}
        aria-haspopup="menu"
      >
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="user-chip-name">{name}</span>
        <Icon name="chevron" size={16} />
      </button>

      {menu.open &&
        createPortal(
          <div
            ref={menu.panelRef}
            className="menu menu-right is-portal elev-lg"
            role="menu"
          >
            <p className="menu-heading">{name}</p>
            <p className="text-meta menu-note">{email}</p>
            {/* "My account" went to a scaffold page and was taken out until 47 was built. It
                is built (name, photo, password), and with no link here it could not be
                reached at all; so it is back (DEC-R04). */}
            <Link to="/app/profile" role="menuitem" className="menu-item" onClick={menu.close}>
              <Icon name="people" size={16} />
              <span>My account</span>
            </Link>
            <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut()}>
              <Icon name="close" size={16} />
              <span>Sign out</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * A top-bar menu: open or not is the store's (one menu at a time); where its panel sits is
 * measured from the anchor and written to the panel directly, before paint and again on
 * scroll and resize.
 */
function useMenu() {
  const id = useId();
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectOpenMenu) === id;
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    dispatch(menuClosed({ id }));
  }, [dispatch, id]);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 9}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
  }, []);

  // Before the browser paints the panel, so it never shows in the wrong place first.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // A menu left open when the bar goes (signing out, say) is closed with it.
  useEffect(() => close, [close]);

  // Effect (DOM): an open menu closes on a press outside it or Escape, and follows scroll and resize.

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, close]);

  return {
    open,
    anchorRef,
    panelRef,
    toggle: () => dispatch(menuToggled({ id })),
    close,
  };
}
