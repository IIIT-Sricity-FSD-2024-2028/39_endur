import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { BillingSummary, Capability, Tier } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Start, { laneState, tierReaches } from './index.js';

let tier: Tier | null = 'bronze';

vi.mock('../../../lib/billing.js', () => ({
  usePlanSummary: (enabled: boolean): BillingSummary | null =>
    enabled && tier
      ? {
          tier,
          status: 'active',
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-09-01T00:00:00.000Z',
          pendingTier: null,
          lapsedFrom: null,
          lapsedFromTrial: null,
          seats: 4,
          seatBreakdown: { activeUsers: 4, nonPersonSubjects: 0 },
        }
      : null,
}));

const show = (capabilities: Capability[]): void => {
  renderWithProviders(<Start />, { capabilities, labels: NONSENSE_LABELS });
};

const ALL_FIVE: Capability[] = [
  'campaign.launch',
  'campaign.create',
  'announcement.create',
  'booking.create',
  'billing.read',
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
    expect(tierReaches(null, 'silver')).toBe(false);
  });
});

describe('laneState — capability first, tier second', () => {
  it('answers the capability before the tier, like the middleware chain does', () => {
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
  it('shows all five lanes to a reader who may start all five', () => {
    tier = 'bronze';
    show(ALL_FIVE);
    for (const lane of ['Poll', 'Suggestion box', 'Feedback', 'Announcement', 'Booking']) {
      expect(screen.getByText(lane)).toBeTruthy();
    }
    expect(screen.getByText('Five ways to ask.')).toBeTruthy();
  });

  it('LEAVES OUT a lane the reader may not use — absent, not a locked card', () => {
    tier = 'bronze';
    show(['campaign.create']);
    expect(screen.queryByText('Poll')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New poll' })).toBeNull();
    expect(screen.queryByText('Announcement')).toBeNull();
    expect(screen.getByText('One way to ask.')).toBeTruthy();
  });

  it('starts a full campaign in the wizard, which is where the form is picked', () => {
    tier = 'bronze';
    show(['campaign.create']);
    expect(screen.getByRole('link', { name: 'New plithe' }).getAttribute('href'))
      .toBe('/app/campaigns/new');
  });

  it('says there is nothing to start when the role can start nothing', () => {
    tier = 'bronze';
    show([]);
    expect(screen.getByText('Nothing to start here')).toBeTruthy();
  });

  it('sends a lane the ORGANISATION lacks to the plan, for whoever may change it', () => {
    tier = 'bronze';
    show([...ALL_FIVE, 'billing.update']);
    const plan = screen.getAllByRole('link', { name: 'See the plan' });
    expect(plan).toHaveLength(2);
    expect(plan[0]?.getAttribute('href')).toBe('/app/plan');
  });

  it('tells everybody else who can, rather than linking to a page they cannot use', () => {
    tier = 'bronze';
    show(ALL_FIVE);
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
    expect(screen.getAllByText(/Whoever manages billing/)).toHaveLength(2);
  });

  it('stops selling a tier the organisation already holds', () => {
    tier = 'enterprise';
    show(ALL_FIVE);
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
  });

  it('sells nothing while the tier is unknown, and does not guess', () => {
    tier = null;
    show(ALL_FIVE);
    expect(screen.queryByRole('link', { name: 'See the plan' })).toBeNull();
  });

  it('asks nothing about the plan of a reader who may not see it, and offers the lane', () => {
    tier = 'bronze';
    show(['announcement.create', 'booking.create']);
    // No tier to sell them and none to wait for: the page it opens answers for the plan.
    expect(screen.getByRole('link', { name: 'Compose' }).getAttribute('href')).toBe('/app/announcements');
    expect(screen.queryByText('Not built yet.')).toBeNull();
  });

  it('leaves out a paid lane the READER may not use, even on a tier that buys it', () => {
    tier = 'enterprise';
    show(['campaign.launch', 'campaign.create']);
    expect(screen.queryByText('Announcement')).toBeNull();
    expect(screen.queryByText('Booking')).toBeNull();
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
