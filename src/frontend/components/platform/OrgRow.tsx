// <OrgRow> — `24` §6b, `70` § Components. One organisation in the estate list.
//
// `PlatformOrgSummary` carries counts only — the prop type is where INV-011 is enforced for
// this component, since a row that cannot RECEIVE response content cannot render it.
import type { PlatformOrgSummary } from '@endur/shared';
import { isQuietOrg } from '@endur/shared';

export function OrgRow({
  org,
  onOpen,
  chips = [],
}: {
  org: PlatformOrgSummary;
  onOpen: (id: string) => void;
  chips?: ('quiet' | 'overSeats')[];
}): JSX.Element {
  return (
    <button type="button" className="org-row" onClick={() => onOpen(org.id)}>
      <div className="org-row-main">
        <span className="org-row-name">{org.name}</span>
        <span className="tag tag-outline org-row-tier">{org.tier}</span>
        {chips.includes('quiet') && <span className="tag tag-neutral">Quiet</span>}
        {chips.includes('overSeats') && <span className="tag tag-bad">Over seats</span>}
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

/**
 * Both chips at once, per `70` § Interactions — evaluated here rather than server-side
 * because the estate list is the client-sorted page it was given (`service.ts:191`), and
 * this predicate is display only.
 */
export function orgChips(org: PlatformOrgSummary): ('quiet' | 'overSeats')[] {
  const chips: ('quiet' | 'overSeats')[] = [];
  // `71`'s decision 4 — the same predicate the analytics `orgsQuiet30d` count uses, imported
  // from `@endur/shared` rather than restated, so the two screens cannot disagree.
  if (isQuietOrg(org)) chips.push('quiet');
  // `seatLimit` is always `null` today (`T-057` unbuilt) — guarded explicitly so this never
  // lights for every customer once seats start at zero.
  if (org.seatLimit !== null && org.seats > org.seatLimit) chips.push('overSeats');
  return chips;
}
