import { NavLink } from 'react-router-dom';
import { Icon } from '../Icon.js';
import { useLabels } from '../../lib/labels.js';
import { useCan } from '../../lib/capabilities.js';
import { GROUP_LABELS, navItems, type NavGroup, type NavItem } from './navItems.js';

const ORDER: NavGroup[] = ['system', 'organize', 'collect', 'understand'];

export function Sidebar({ onNavigate }: { onNavigate?: (() => void) | undefined }): JSX.Element {
  const labels = useLabels();
  const can = useCan();

  const items = navItems(labels).filter(
    (item) => !item.needs || can(item.needs, item.minScope),
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
    </NavLink>
  );
}
