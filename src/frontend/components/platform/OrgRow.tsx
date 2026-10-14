import type { PlatformOrgSummary } from '@endur/shared';
import { isQuietOrg } from '@endur/shared';
import { NOTICE_WINDOW_DAYS, daysUntil } from '../billing/PlanNoticeBanner.js';

export function OrgRow({
  org,
  onOpen,
  chips = [],
}: {
  org: PlatformOrgSummary;
  onOpen: (id: string) => void;
  chips?: OrgChip[];
}): JSX.Element {
  return (
    <button type="button" className="org-row" onClick={() => onOpen(org.id)}>
      <div className="org-row-main">
        <span className="org-row-name">{org.name}</span>
        <span className="tag tag-outline org-row-tier">{org.tier}</span>
        {chips.includes('quiet') && <span className="tag tag-neutral">Quiet</span>}
        {chips.includes('overSeats') && <span className="tag tag-bad">Over seats</span>}
        {/* DEC-113. The tier beside it is already the EFFECTIVE one, so a lapsed organisation
            reads as `bronze` on this row — which is correct and, on its own, indistinguishable
            from a customer who chose Bronze. This chip is the difference, and the difference is
            the whole of what an operator wants from the estate list after an expiry. */}
        {chips.includes('lapsed') && <span className="tag tag-warn">Lapsed</span>}
        {chips.includes('endingSoon') && <span className="tag tag-warn">Ending soon</span>}
        {org.suspendedAt && <span className="tag tag-bad">Suspended</span>}
      </div>
      <div className="org-row-meta text-meta">
        <span>{org.seats} seats</span>
        <span>{org.activeCampaigns} active</span>
        <span>
          {org.lastActivityAt
            ? `Last active ${new Date(org.lastActivityAt).toLocaleDateString()}`
            : 'No activity yet'}
        </span>
      </div>
    </button>
  );
}

export type OrgChip = 'quiet' | 'overSeats' | 'lapsed' | 'endingSoon';

export function orgChips(org: PlatformOrgSummary, now: Date = new Date()): OrgChip[] {
  const chips: OrgChip[] = [];
  if (isQuietOrg(org)) chips.push('quiet');
  if (org.seatLimit !== null && org.seats > org.seatLimit) chips.push('overSeats');
  if (org.lapsedFrom) chips.push('lapsed');
  else if (endingSoon(org, now)) chips.push('endingSoon');
  return chips;
}

function endingSoon(org: PlatformOrgSummary, now: Date): boolean {
  if (org.tier === 'bronze' || !org.periodEnd) return false;
  const left = daysUntil(org.periodEnd, now);
  return left >= 0 && left <= NOTICE_WINDOW_DAYS;
}
