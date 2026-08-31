// T-108 — the plan notice. DEC-113, 16 §7d.
//
// `noticeFor()` IS TESTED WITHOUT RENDERING ANYTHING, on purpose. What decides whether a
// customer is warned is three rules and a date comparison, and the interesting cases are all
// boundaries — the day itself, the day after, one day outside the window. Driving those
// through a component render would test React and assert the rule by accident.
//
// The component test that follows is about the one thing the function cannot say: that this
// appears on a page the customer did not navigate to, and stays absent for a reader who
// cannot see billing at all.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { BillingSummary, Tier } from '@endur/shared';
import { renderWithProviders } from '../../test-utils.js';
import { NOTICE_WINDOW_DAYS, daysUntil, noticeFor, PlanNoticeBanner } from './PlanNoticeBanner.js';

const NOW = new Date('2026-09-10T09:00:00.000Z');

const summaryOf = (over: Partial<BillingSummary> = {}): BillingSummary => ({
  tier: 'gold',
  status: 'active',
  periodStart: '2026-08-20T00:00:00.000Z',
  periodEnd: '2026-09-20T00:00:00.000Z',
  pendingTier: null,
  lapsedFrom: null,
  seats: 12,
  seatBreakdown: { activeUsers: 10, nonPersonSubjects: 2 },
  ...over,
});

const endingIn = (days: number, tier: Tier = 'gold'): BillingSummary => {
  const end = new Date(NOW.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return summaryOf({ tier, periodEnd: end.toISOString() });
};

describe('when the notice appears — 16 §7d', () => {
  it('says nothing while the period has room left', () => {
    expect(noticeFor(endingIn(NOTICE_WINDOW_DAYS + 1), NOW)).toBeNull();
  });

  it('warns on the first day inside the window, and on the last day of the plan', () => {
    expect(noticeFor(endingIn(NOTICE_WINDOW_DAYS), NOW)?.tone).toBe('ending');
    // THE DAY ITSELF IS STILL A DAY THEY HOLD THE PLAN — `periodHasEnded` is inclusive of it
    // on the server, and a client that warned in the past tense a day early would contradict
    // the gate that is still opening the screens.
    expect(noticeFor(endingIn(0), NOW)?.tone).toBe('ending');
  });

  /**
   * A DATE IN THE PAST WITH NOTHING LAPSED IS SILENCE, not a stale warning. It is a real
   * state and it is brief: the server moves the row on the first read, so this is the window
   * between the date passing and `readBilling` catching up. Saying *"your plan ends on 3
   * September"* on 10 September would be the product reading its own row wrong out loud.
   */
  it('says nothing about a date that has already gone', () => {
    expect(noticeFor(endingIn(-1), NOW)).toBeNull();
  });

  it('never warns a bronze organisation — it rolls forward free', () => {
    expect(noticeFor(endingIn(1, 'bronze'), NOW)).toBeNull();
  });

  /** The lapse notice NAMES THE TIER, which is the entire reason `lapsedFrom` is not a flag. */
  it('names what was lost once the plan has gone', () => {
    const notice = noticeFor(summaryOf({ tier: 'bronze', lapsedFrom: 'gold' }), NOW);
    expect(notice?.tone).toBe('lapsed');
    expect(notice?.text).toContain('Gold');
    expect(notice?.text).toContain('Bronze');
    // NO DATE. `periodStart` is when the lapse was NOTICED, not when the plan ran out, and
    // printing it as "ended on" would state a date that is usually wrong.
    expect(notice?.text).not.toMatch(/\d{4}/);
  });

  it('beats the ending warning — a lapsed plan is not also about to end', () => {
    const both = summaryOf({ tier: 'bronze', lapsedFrom: 'silver', periodEnd: endingIn(2).periodEnd });
    expect(noticeFor(both, NOW)?.tone).toBe('lapsed');
  });

  it('counts whole days in UTC, so a period does not end at whatever o clock the reader is in', () => {
    expect(daysUntil('2026-09-20T00:00:00.000Z', NOW)).toBe(10);
    expect(daysUntil('2026-09-10T23:59:00.000Z', NOW)).toBe(0);
  });
});

const apiGet = vi.fn<(path: string) => Promise<{ data: BillingSummary }>>();
vi.mock('../../lib/api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/api.js');
  return { ...actual, apiGet: (path: string) => apiGet(path) };
});

describe('the banner in the console shell', () => {
  it('renders the sentence and a way to act on it', async () => {
    apiGet.mockResolvedValue({ data: summaryOf({ tier: 'bronze', lapsedFrom: 'gold' }) });
    renderWithProviders(<PlanNoticeBanner />, { capabilities: ['billing.read'] });

    const strip = await screen.findByRole('status');
    expect(strip.textContent).toMatch(/Gold plan has ended/i);
    expect(screen.getByRole('link', { name: /choose a plan/i }).getAttribute('href')).toBe(
      '/app/plan',
    );
  });

  /**
   * WITHOUT `billing.read` IT IS ABSENT AND IT DOES NOT ASK. Two properties in one assertion,
   * and the second is the one worth having: a reader who cannot see billing must not make the
   * console fire a request that 403s on every page they open.
   */
  it('is silent, and makes no request, for a reader who cannot see billing', () => {
    apiGet.mockClear();
    renderWithProviders(<PlanNoticeBanner />, { capabilities: ['campaign.read'] });

    expect(screen.queryByRole('status')).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
