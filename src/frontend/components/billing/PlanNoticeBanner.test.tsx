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
  lapsedFromTrial: null,
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
    expect(noticeFor(endingIn(0), NOW)?.tone).toBe('ending');
  });

  it('says nothing about a date that has already gone', () => {
    expect(noticeFor(endingIn(-1), NOW)).toBeNull();
  });

  // There is no renewal before the end (DEC-113), so the banner must not offer one: its button
  // used to say Renew and open a page where the current plan cannot be pressed.
  it('does not promise a renewal, and says how to get the plan back', () => {
    const notice = noticeFor(endingIn(3), NOW);
    expect(notice?.action).not.toMatch(/renew/i);
    expect(notice?.text).not.toMatch(/renew it/i);
    expect(notice?.text).toMatch(/join Gold again/);
  });

  it('never warns a bronze organisation — it rolls forward free', () => {
    expect(noticeFor(endingIn(1, 'bronze'), NOW)).toBeNull();
  });

  it('names what was lost once the plan has gone', () => {
    const notice = noticeFor(summaryOf({ tier: 'bronze', lapsedFrom: 'gold' }), NOW);
    expect(notice?.tone).toBe('lapsed');
    expect(notice?.text).toContain('Gold');
    expect(notice?.text).toContain('Bronze');
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

  it('is silent, and makes no request, for a reader who cannot see billing', () => {
    apiGet.mockClear();
    renderWithProviders(<PlanNoticeBanner />, { capabilities: ['campaign.read'] });

    expect(screen.queryByRole('status')).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
