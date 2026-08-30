// T-093 — the start gallery's FOUR REASONS a lane cannot be pressed, which are the whole of
// what this page decides. Everything else on it is copy.
//
// The order of the two gates is the one assertion worth having twice: capability first,
// tier second, matching the middleware chain (`app.ts:108-113`). Offering an upgrade to
// somebody who would be refused anyway sells them a fix for the wrong problem.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { BillingSummary, Capability, Tier } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Start, { laneState, tierReaches } from './index.js';

let tier: Tier | null = 'bronze';

vi.mock('../../../lib/billing.js', () => ({
  useBilling: (): { data: BillingSummary | null; loading: boolean; error: Error | null } => ({
    data: tier
      ? {
          tier,
          status: 'active',
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-09-01T00:00:00.000Z',
          pendingTier: null,
          seats: 4,
          seatBreakdown: { activeUsers: 4, nonPersonSubjects: 0 },
        }
      : null,
    loading: false,
    error: null,
  }),
}));

const show = (capabilities: Capability[]): void => {
  renderWithProviders(<Start />, { capabilities, labels: NONSENSE_LABELS });
};

/**
 * What an L1 administrator holds for all five lanes — T-096, when the last two stopped being
 * `soon` cards and started being gated on real verbs.
 *
 * It is written out rather than "everything", because the point of the tier tests below is
 * that a lane with the CAPABILITY and without the TIER sells the tier. Before the two
 * features landed those lanes had no capability to hold, so the same tests passed for a
 * reason that no longer exists.
 */
const ALL_FIVE: Capability[] = [
  'campaign.launch',
  'template.read',
  'announcement.create',
  'booking.create',
];

describe('tierReaches — the ladder, compared by ORDER', () => {
  it('reaches its own rung and everything under it', () => {
    expect(tierReaches('gold', 'silver')).toBe(true);
    expect(tierReaches('silver', 'silver')).toBe(true);
  });

  it('does not reach above itself', () => {
    expect(tierReaches('bronze', 'silver')).toBe(false);
    expect(tierReaches('silver', 'gold')).toBe(false);
  });

  it('reaches nothing at all when the tier is not known yet', () => {
    // Loading, or a failed request. Guessing Bronze would sell somebody what they own.
    expect(tierReaches(null, 'silver')).toBe(false);
  });
});

describe('laneState — capability first, tier second', () => {
  it('answers the capability before the tier, like the middleware chain does', () => {
    // A reader who may not do this at all is told THAT, not told to buy an upgrade for
    // something they would still be refused (403 outranks 402).
    expect(laneState({ allowed: false, built: true, needsTier: 'gold', heldTier: 'bronze' }))
      .toBe('capability');
  });

  it('offers the tier when the reader may, and the organisation may not', () => {
    expect(laneState({ allowed: true, built: true, needsTier: 'gold', heldTier: 'bronze' }))
      .toBe('tier');
  });

  it('says soon for a surface that is not built yet, tier or no tier', () => {
    expect(laneState({ allowed: true, built: false, needsTier: 'gold', heldTier: 'gold' }))
      .toBe('soon');
  });

  it('says soon rather than selling anything while the tier is unknown', () => {
    expect(laneState({ allowed: true, built: true, needsTier: 'gold', heldTier: null }))
      .toBe('soon');
  });

  it('is ready when nothing is in the way', () => {
    expect(laneState({ allowed: true, built: true, heldTier: 'bronze' })).toBe('ready');
  });
});

describe('the gallery', () => {
  it('shows all five lanes to a reader who can launch', () => {
    tier = 'bronze';
    show(['campaign.launch', 'template.read']);
    for (const lane of ['Poll', 'Suggestion box', 'Feedback', 'Announcement', 'Booking']) {
      expect(screen.getByText(lane)).toBeTruthy();
    }
  });

  it('disables a lane the reader may not use, and says why', () => {
    tier = 'bronze';
    show(['template.read']);
    const poll = screen.getByRole('button', { name: 'New poll' });
    expect((poll as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('You cannot launch here.');
  });

  it('sends a lane the ORGANISATION lacks to the plan, never to a dead card', () => {
    tier = 'bronze';
    show(ALL_FIVE);
    const plan = screen.getAllByRole('link', { name: 'See the plan' });
    // Announcement (silver) and Booking (gold), both above Bronze.
    expect(plan).toHaveLength(2);
    expect(plan[0]?.getAttribute('href')).toBe('/app/plan');
  });

  it('stops selling a tier the organisation already holds', () => {
    tier = 'enterprise';
    show(ALL_FIVE);
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
  });

  it('sells nothing while the tier is unknown, and does not guess', () => {
    // A Gold customer shown an upgrade card for one paint is being sold what they own.
    tier = null;
    show(ALL_FIVE);
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
  });

  /**
   * T-096, and the assertion the two new lanes exist to make on this page: the CAPABILITY is
   * answered before the tier. A Gold organisation whose reader cannot write announcements is
   * told they cannot write announcements — not sold an upgrade for a verb they would still
   * be refused (403 outranks 402, `app.ts` links 10-11).
   */
  it('disables a paid lane the READER may not use, even on a tier that buys it', () => {
    tier = 'enterprise';
    show(['campaign.launch', 'template.read']);
    expect(document.body.textContent).toContain('You cannot write announcements here.');
    expect(document.body.textContent).toContain('You cannot publish bookable times here.');
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
  });

  it('links the two paid lanes to their own pages once everything is in place', () => {
    tier = 'gold';
    show(ALL_FIVE);
    expect(screen.getByRole('link', { name: 'Compose' }).getAttribute('href')).toBe(
      '/app/announcements',
    );
    expect(screen.getByRole('link', { name: 'Add slots' }).getAttribute('href')).toBe(
      '/app/booking',
    );
  });
});
