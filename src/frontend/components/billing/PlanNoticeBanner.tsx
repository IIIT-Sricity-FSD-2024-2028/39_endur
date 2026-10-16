import { useEffect, useState } from 'react';
import type { BillingSummary, Tier } from '@endur/shared';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api.js';
import { useCan } from '../../lib/capabilities.js';
import { formatDate } from '../../lib/format.js';

export const NOTICE_WINDOW_DAYS = 7;

export function daysUntil(iso: string, now: Date = new Date()): number {
  const end = new Date(iso);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

const tierName = (tier: Tier): string => tier.charAt(0).toUpperCase() + tier.slice(1);

export function noticeFor(
  summary: BillingSummary,
  now: Date = new Date(),
): { tone: 'lapsed' | 'ending'; text: string; action: string } | null {
  if (summary.lapsedFrom) {
    const noun = summary.lapsedFromTrial ? 'trial' : 'plan';
    return {
      tone: 'lapsed',
      text:
        `Your ${tierName(summary.lapsedFrom)} ${noun} has ended and this organisation is now on ` +
        `${tierName(summary.tier)}. Nothing you have collected has been deleted.`,
      action: 'Choose a plan',
    };
  }

  if (summary.tier === 'bronze' && summary.status !== 'trialing') return null;

  const left = daysUntil(summary.periodEnd, now);
  if (left < 0 || left > NOTICE_WINDOW_DAYS) return null;

  if (summary.status === 'trialing') {
    return {
      tone: 'ending',
      text:
        `Your ${tierName(summary.tier)} trial ends on ${formatDate(summary.periodEnd)}. ` +
        `Add payment to keep it — otherwise this organisation moves to ${tierName('bronze')}.`,
      action: 'Add payment',
    };
  }

  // No "Renew": a plan cannot be renewed before it ends (DEC-113 - the way back is joining again
  // once it has), so a button promising one would open a page with nothing to press.
  return {
    tone: 'ending',
    text:
      `Your ${tierName(summary.tier)} plan ends on ${formatDate(summary.periodEnd)}. ` +
      `Plans do not renew on their own: after that this organisation moves to ` +
      `${tierName('bronze')}, and you can join ${tierName(summary.tier)} again from Plan.`,
    action: 'View plan',
  };
}

export function PlanNoticeBanner(): JSX.Element | null {
  const can = useCan();
  const mayRead = can('billing.read');
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    if (!mayRead) return;
    let live = true;
    void apiGet<{ data: BillingSummary }>('/billing')
      .then((response) => {
        if (live) setSummary(response.data);
      })
      // SILENT ON FAILURE, and deliberately. This is chrome on somebody else's page: a
      // console that cannot load a billing summary must still render the page the reader
      // asked for, and an error strip about a plan on top of a broken subjects list tells
      // them about the wrong problem.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mayRead]);

  if (!summary) return null;
  const notice = noticeFor(summary);
  if (!notice) return null;

  return (
    <div className={`plan-notice plan-notice-${notice.tone}`} role="status">
      <span>{notice.text}</span>
      <Link className="btn btn-sm btn-secondary" to="/app/plan">
        {notice.action}
      </Link>
    </div>
  );
}
