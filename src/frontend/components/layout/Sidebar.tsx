// 232px of chrome, grouped, with the roadmap visible and inert. design_specs/design/02 §3.
//
// The disabled items are the interesting part. They never navigate, always carry the
// "Soon" tag, and explain themselves on hover — and there is deliberately no page behind
// them. A dead link that renders something is worse than one that visibly does not move
// (design_specs/design/02 §7, 20 §2).
import { NavLink } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { useLabels } from '../../lib/labels.js';
import { useCan } from '../../lib/capabilities.js';
import { GROUP_LABELS, navItems, type NavGroup, type NavItem } from './navItems.js';

const ORDER: NavGroup[] = ['system', 'organize', 'collect', 'understand'];

export function Sidebar({ onNavigate }: { onNavigate?: (() => void) | undefined }): JSX.Element {
  const labels = useLabels();
  const can = useCan();

  // Out-of-scope navigation is ABSENT, not greyed out — greying it out would be a list of
  // everything the caller cannot do (design_specs/design/02 §5). "Soon" is a different
  // thing entirely: it means nobody can do it yet.
  const items = navItems(labels).filter((item) => !item.needs || can(item.needs));

  return (
    <nav className="sidebar" aria-label="Sections">
      {ORDER.map((group) => {
        const inGroup = items.filter((item) => item.group === group);
        if (inGroup.length === 0) return null;
        const heading = GROUP_LABELS[group];

        return (
          <div className="sidebar-group" key={group}>
            {heading && <p className="utility sidebar-heading">{heading}</p>}
            <ul>
              {inGroup.map((item) => (
                <li key={item.to}>
                  <Item item={item} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: (() => void) | undefined }): JSX.Element {
  if (item.disabled) {
    // A <span>, not a disabled <a>. There is no href to follow and nothing to focus, which
    // is exactly the behaviour required — and it cannot be tabbed into by accident.
    return (
      <span className="sidebar-item is-soon" title={item.soonHint} aria-disabled="true">
        <Icon name={item.icon} size={20} />
        <span>{item.label}</span>
        <span className="tag tag-neutral sidebar-soon">Soon</span>
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      // `end` on Home only: without it, /app matches every child route and Home stays lit
      // on every page in the console.
      end={item.to === '/app'}
      className={({ isActive }) => `sidebar-item${isActive ? ' is-active' : ''}`}
      onClick={onNavigate}
    >
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
    </NavLink>
  );
}
