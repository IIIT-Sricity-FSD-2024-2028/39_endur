import { NavLink } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { useLabels } from '../../lib/labels.js';
import { canAny, useCan } from '../../lib/capabilities.js';
import { useWaiting } from '../../lib/waiting.js';
import { GROUP_LABELS, navItems, type NavGroup, type NavItem } from './navItems.js';

const ORDER: NavGroup[] = ['system', 'organize', 'collect', 'understand'];

export function Sidebar({ onNavigate }: { onNavigate?: (() => void) | undefined }): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  // Forms waiting for this person's answer: the count beside Home, where the card is.
  const waiting = useWaiting().rows.length;

  const items = navItems(labels).filter(
    (item) => !item.needs || canAny(can, typeof item.needs === 'string' ? [item.needs] : item.needs, item.minScope),
  );

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
                  <Item item={item} onNavigate={onNavigate} count={item.to === '/app' ? waiting : 0} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Item({
  item,
  onNavigate,
  count = 0,
}: {
  item: NavItem;
  onNavigate?: (() => void) | undefined;
  count?: number;
}): JSX.Element {
  if (item.disabled) {
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
      end={item.to === '/app'}
      className={({ isActive }) => `sidebar-item${isActive ? ' is-active' : ''}`}
      onClick={onNavigate}
    >
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
      {count > 0 && (
        <>
          <span className="sidebar-count" aria-hidden="true">{count}</span>
          <span className="sr-only">, {count} waiting for your answer</span>
        </>
      )}
    </NavLink>
  );
}
