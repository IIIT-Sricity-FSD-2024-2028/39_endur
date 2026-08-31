// 56px, sticky. design_specs/design/02 §3.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { ThemeToggle } from '../ThemeToggle.js';
import { useAppSelector } from '../../store/index.js';
import { signOut } from '../../lib/session.js';

export function TopBar({
  onOpenMenu,
}: {
  /** Absent means there is no navigation to open — the setup wizard's focused shell. A
   *  hamburger that opens an empty drawer is worse than no hamburger. */
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
        menu.rect &&
        createPortal(
          <div
            ref={menu.panelRef}
            className="menu menu-right is-portal elev-lg"
            role="menu"
            style={{ top: menu.rect.bottom + 9, right: window.innerWidth - menu.rect.right }}
          >
            <p className="menu-heading">{name}</p>
            <p className="text-meta menu-note">{email}</p>
            {/* "My account" lived here and went to a scaffold page. Out until 47 is built —
                the name and email above already say who is signed in, which is what the menu
                is actually for (design_specs/design/02 §7). */}
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
 * Open/close with the two dismissals people actually expect: click away, and Escape.
 *
 * The panel renders through a portal into `document.body` — see the §1 note above — so it
 * is no longer a DOM descendant of the anchor. Outside-click detection has to check both
 * the anchor and the (separately ref'd) panel; the anchor's bounding rect is recomputed on
 * open, resize and scroll so the panel tracks it.
 */
function useMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const updateRect = useCallback(() => {
    if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onPointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onReflow = (): void => updateRect();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, updateRect]);

  return {
    open,
    rect,
    anchorRef,
    panelRef,
    toggle: () => setOpen((was) => !was),
    close: () => setOpen(false),
  };
}
