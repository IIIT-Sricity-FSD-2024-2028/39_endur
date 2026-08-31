// <OrgRow> — `24` §6b, `70` § Components. One organisation in the estate list.
//
// `PlatformOrgSummary` carries counts only — the prop type is where INV-011 is enforced for
// this component, since a row that cannot RECEIVE response content cannot render it.
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

/**
 * Every chip at once, per `70` § Interactions — evaluated here rather than server-side
 * because the estate list is the client-sorted page it was given (`service.ts:191`), and
 * these predicates are display only.
 */
export function orgChips(org: PlatformOrgSummary, now: Date = new Date()): OrgChip[] {
  const chips: OrgChip[] = [];
  // `71`'s decision 4 — the same predicate the analytics `orgsQuiet30d` count uses, imported
  // from `@endur/shared` rather than restated, so the two screens cannot disagree.
  if (isQuietOrg(org)) chips.push('quiet');
  // `seatLimit` is always `null` today (`T-057` unbuilt) — guarded explicitly so this never
  // lights for every customer once seats start at zero.
  if (org.seatLimit !== null && org.seats > org.seatLimit) chips.push('overSeats');
  // DEC-113, and the two are mutually exclusive by construction: `lapsedFrom` is only ever set
  // on a bronze row whose period has just restarted, so it can never also be a paid plan with
  // days left. Written as `else` anyway — two chips saying opposite things about one plan is
  // the kind of thing a later change makes possible without meaning to.
  if (org.lapsedFrom) chips.push('lapsed');
  else if (endingSoon(org, now)) chips.push('endingSoon');
  return chips;
}

/**
 * A paid plan inside its last seven days — the same window the customer's own banner uses
 * (`components/billing/PlanNoticeBanner.tsx`, `16` §7d).
 *
 * BRONZE IS NEVER "ENDING". It rolls forward free, so there is no expiry for an operator to
 * act on and a chip there would light on most of the estate, permanently, meaning nothing.
 */
function endingSoon(org: PlatformOrgSummary, now: Date): boolean {
  if (org.tier === 'bronze' || !org.periodEnd) return false;
  const left = daysUntil(org.periodEnd, now);
  return left >= 0 && left <= NOTICE_WINDOW_DAYS;
}
