// The operator console's small pieces (R-716). Presentational only: every figure they print
// arrives already worked out by a selector (`store/screens/opsReports.ts`), and none of
// them computes one. A share is always printed with what it is a share OF.
import type { ReactNode } from 'react';
import type { Tier } from '@endur/shared';
import { Icon, type IconName } from '../Icon.js';
import type { Share } from '../../store/screens/opsReports.js';

export function OpsHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="ops-header">
      <div className="ops-header-text">
        <p className="utility ops-kicker">{kicker}</p>
        <h1>{title}</h1>
        {subtitle && <p className="ops-header-sub">{subtitle}</p>}
      </div>
      {actions && <div className="ops-header-actions">{actions}</div>}
    </header>
  );
}

export function Kpi({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode | undefined;
  icon?: IconName | undefined;
  tone?: 'good' | 'warn' | 'bad' | 'gold' | undefined;
}): JSX.Element {
  return (
    <div className={`ops-kpi card${tone ? ` is-${tone}` : ''}`}>
      <p className="utility ops-kpi-label">
        {icon && <Icon name={icon} size={16} />}
        {label}
      </p>
      <p className="ops-kpi-value">{value}</p>
      {detail && <p className="ops-kpi-detail">{detail}</p>}
    </div>
  );
}

/** "37 of 50 · 74%": a share, said in full. */
export function ShareText({ share, unit }: { share: Share; unit?: string }): JSX.Element {
  return (
    <span className="ops-how">
      {share.count.toLocaleString()} of {share.of.toLocaleString()}
      {unit ? ` ${unit}` : ''} · {share.percent}%
    </span>
  );
}

export function TierPill({ tier, label }: { tier: Tier; label: string }): JSX.Element {
  return <span className={`ops-tier is-${tier}`}>{label}</span>;
}

export function Pill({
  tone,
  children,
}: {
  tone?: 'good' | 'warn' | 'bad' | 'accent' | undefined;
  children: ReactNode;
}): JSX.Element {
  return <span className={`ops-pill${tone ? ` is-${tone}` : ''}`}>{children}</span>;
}

/** One row of a mix: the bar's width IS the selector's percent, never re-derived. */
export function ShareRow({
  label,
  share,
  fill,
}: {
  label: string;
  share: Share;
  fill: string;
}): JSX.Element {
  return (
    <div className="ops-share">
      <span className="ops-share-label">
        <span className={`ops-key ${fill}`} aria-hidden="true" />
        {label}
      </span>
      <span className="ops-share-track" aria-hidden="true">
        <span className={`ops-share-fill ${fill}`} style={{ width: `${share.percent}%` }} />
      </span>
      <span className="ops-share-count">
        {share.count.toLocaleString()} of {share.of.toLocaleString()}
      </span>
      <span className="ops-share-percent">{share.percent}%</span>
    </div>
  );
}

export function Denied({ capability, what }: { capability: string; what: string }): JSX.Element {
  return (
    <div className="ops-denied card ops-card">
      <Icon name="operator" size={24} />
      <h2>You do not have access to this</h2>
      <p className="text-muted">
        {what} needs the <code>{capability}</code> capability, which your operator role does not hold.
      </p>
    </div>
  );
}

export function OpsError({ children, action }: { children: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <p className="ops-error" role="alert">
      {children}
      {action}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="ops-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
