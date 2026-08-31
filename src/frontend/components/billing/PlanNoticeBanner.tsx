// The plan is about to run out, or it already did. `16` §7d, `49`, DEC-113.
//
// WHY THIS IS IN THE SHELL AND NOT ON `/app/plan`. Everything about expiry was already
// discoverable on the plan page — the period's end date has been printed there since `T-058`
// — and the owner's report was still *"nothing happens for the client"*. That is the whole
// lesson: a fact nobody navigates to is a fact nobody has. A plan lapses on a Tuesday, and the
// person who finds out is whoever next opens a Gold screen and meets a 402 they cannot
// explain. `<OverLimitBanner>` is in the shell for the identical reason (`16` §6) — a customer
// over their seat count must see the number everywhere, not discover it in settings.
//
// TWO STATES, AND THEY ARE DIFFERENT KINDS OF SENTENCE.
//
//   · ENDING — the last seven days of a paid period. A warning, in warm ink, with a date and
//     an action. Seven because `16` §7d says so: a fortnight early is furniture people learn
//     to ignore, and the morning of is not a warning at all.
//   · LAPSED — the period ended, nobody renewed, and the organisation is on Bronze. Past
//     tense, and it NAMES THE TIER IT LOST, which is the entire reason `lapsed_from` is a
//     column and not a boolean. "You are on Bronze" explains nothing to somebody who was on
//     Gold yesterday.
//
// IT NEVER NAGS A BRONZE ORGANISATION. Bronze rolls forward free (`16` §7d), so there is no
// end date to warn about and nothing to renew — a banner there would be the product asking
// for money it has decided not to charge.
//
// `billing.read` GATES IT, and that is INV-003 the ordinary way round: the capability map says
// which chrome is worth rendering, and somebody who cannot read the plan is not shown a
// sentence about it — nor made to fire a request that would 403. The customer's remedy is on
// `/app/plan` behind the same capability, so a reader who could act on this can see it.
import { useEffect, useState } from 'react';
import type { BillingSummary, Tier } from '@endur/shared';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api.js';
import { useCan } from '../../lib/capabilities.js';
import { formatDate } from '../../lib/format.js';

/**
 * How close is close enough to say something. `16` §7d.
 *
 * Exported because the rule is worth asserting without rendering a shell: the boundary cases
 * — the day itself, the day after, eight days out — are where an off-by-one would either
 * warn a customer forever or never warn them at all.
 */
export const NOTICE_WINDOW_DAYS = 7;

/**
 * Whole days from today until `iso`, in UTC. Negative once the date has gone.
 *
 * BOTH SIDES AT UTC MIDNIGHT, which is the same care `billing/period.ts` `periodHasEnded`
 * takes on the server and for the same reason: `period_end` is a DATE with no time on it, and
 * comparing it against a moment makes a period end at whatever o'clock the reader is in.
 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const end = new Date(iso);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/**
 * THE TIER WORD, NOT THE CATALOGUE NAME, and this is the one place in the product that makes
 * that choice. `PLAN_OPTIONS[].name` is *"Gold — Improve"* — the tier and its promise, which
 * is right on a card the customer is choosing between and wrong in a sentence: *"Your Gold —
 * Improve plan has ended and this organisation is now on Bronze — Measure"* is a line nobody
 * would write by hand. A banner has one job and one line to do it in.
 *
 * NOT AN INV-001 CONCERN. Tier names are Endur's own furniture, like Save and Settings — they
 * are not domain nouns and never resolve through `useLabels()` (`11` §, and `19` §4 makes the
 * same call for the operator console).
 */
const tierName = (tier: Tier): string => tier.charAt(0).toUpperCase() + tier.slice(1);

/** What to say, or `null` for the ordinary case — which is almost every render. */
export function noticeFor(
  summary: BillingSummary,
  now: Date = new Date(),
): { tone: 'lapsed' | 'ending'; text: string; action: string } | null {
  if (summary.lapsedFrom) {
    return {
      tone: 'lapsed',
      // NO DATE ON THIS ONE, and the reason is worth writing down so nobody helpfully adds
      // one. `periodStart` is when the LAPSE WAS NOTICED — the first read after the date
      // passed, which with no scheduler is whenever somebody next opened a page — not when
      // the old plan ran out. Printing it as "ended on" would state a date that is usually
      // wrong, and a wrong date on a billing notice is worse than no date.
      text:
        `Your ${tierName(summary.lapsedFrom)} plan has ended and this organisation is now on ` +
        `${tierName(summary.tier)}. Nothing you have collected has been deleted.`,
      action: 'Choose a plan',
    };
  }

  // Bronze has no end to warn about — see the header.
  if (summary.tier === 'bronze') return null;

  const left = daysUntil(summary.periodEnd, now);
  if (left < 0 || left > NOTICE_WINDOW_DAYS) return null;

  return {
    tone: 'ending',
    text:
      `Your ${tierName(summary.tier)} plan ends on ${formatDate(summary.periodEnd)}. ` +
      `Renew it to keep what it includes — otherwise this organisation moves to ` +
      `${tierName('bronze')}.`,
    action: 'Renew',
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
