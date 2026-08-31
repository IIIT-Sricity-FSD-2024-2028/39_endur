// <EmptyState> — 24 §6, copy rules from design_specs/design/10 §3.
//
// Never an illustration, never more than one action. An empty screen is the one moment
// where the product has the reader's whole attention and nothing to distract them, so it
// says what this place is for and offers the single next step — not three.
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
