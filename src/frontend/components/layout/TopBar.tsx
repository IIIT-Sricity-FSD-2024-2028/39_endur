// 56px, sticky, and it carries the second most important control in the demo.
// design_specs/design/02 §3.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { useAppSelector } from '../../store/index.js';
import { signOut, switchToDemoOrg } from '../../lib/session.js';
import { DEMO_ORGS, isDemoBuild } from '../../lib/demo.js';

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

      <OrgSwitcher name={org?.name ?? ''} />

      <div className="topbar-right">
        <UserChip name={user?.name ?? ''} email={user?.email ?? ''} />
      </div>
    </header>
  );
}

/**
 * The org name, and — in a development build only — a way to become another demo org.
 *
 * When there is nowhere to switch to, this renders as plain text rather than a dead
 * dropdown. A chevron that opens an empty menu is worse than no chevron.
 */
function OrgSwitcher({ name }: { name: string }): JSX.Element {
  const org = useAppSelector((s) => s.auth.org);
  const menu = useMenu();

  if (!isDemoBuild()) return <span className="topbar-org">{name}</span>;

  return (
    <div className="menu-anchor" ref={menu.ref}>
      <button
        type="button"
        className="btn btn-ghost topbar-org"
        onClick={menu.toggle}
        aria-expanded={menu.open}
        aria-haspopup="menu"
      >
        <span>{name}</span>
        <Icon name="chevron" size={16} />
      </button>

      {menu.open && (
        <div className="menu elev-lg" role="menu">
          <p className="utility menu-heading">Demo organizations</p>
          {DEMO_ORGS.map((demo) => (
            <button
              key={demo.slug}
              type="button"
              role="menuitem"
              className="menu-item"
              // Current org first, so the menu reads as a state rather than a list of
              // strangers.
              aria-current={demo.name === org?.name}
              onClick={() => void switchToDemoOrg(demo)}
            >
              <Icon name="organization" size={16} />
              <span>{demo.name}</span>
              <span className="tag tag-neutral menu-tag">{demo.industry}</span>
            </button>
          ))}
          <p className="text-meta menu-note">
            Development build only. Each one is a separate account, so this signs in again.
          </p>
        </div>
      )}
    </div>
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
    <div className="menu-anchor" ref={menu.ref}>
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

      {menu.open && (
        <div className="menu menu-right elev-lg" role="menu">
          <p className="menu-heading">{name}</p>
          <p className="text-meta menu-note">{email}</p>
          {/* "My account" lived here and went to a scaffold page. Out until 47 is built —
              the name and email above already say who is signed in, which is what the menu
              is actually for (design_specs/design/02 §7). */}
          <button type="button" role="menuitem" className="menu-item" onClick={() => void signOut()}>
            <Icon name="close" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Open/close with the two dismissals people actually expect: click away, and Escape. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return {
    open,
    ref,
    toggle: () => setOpen((was) => !was),
    close: () => setOpen(false),
  };
}
