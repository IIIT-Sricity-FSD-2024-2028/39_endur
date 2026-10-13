import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon.js';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="empty-state">
      <Icon name={icon} size={24} className="empty-icon" />
      <h3 className="empty-title">{title}</h3>
      <p className="empty-body">{body}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
