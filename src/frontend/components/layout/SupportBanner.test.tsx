import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { SupportContext } from '@endur/shared';
import { renderWithProviders } from '../../test-utils.js';
import { SupportBanner, minutesLeft } from './SupportBanner.js';

const NOW = new Date('2026-09-10T09:00:00.000Z');

const contextOf = (over: Partial<SupportContext> = {}): SupportContext => ({
  viewer: 'member',
  operatorName: 'Priya Raman',
  operatorEmail: 'priya@endur.test',
  role: 'staff',
  reason: 'Ticket 418 — their campaign will not launch',
  startedAt: '2026-09-10T09:00:00.000Z',
  expiresAt: '2026-09-10T10:00:00.000Z',
  ...over,
});

describe('the countdown — the customer’s only guarantee that it ends', () => {
  it('floors, so “1 minute” never means ninety seconds', () => {
    const ninetySeconds = new Date(NOW.getTime() + 90_000).toISOString();
    expect(minutesLeft(ninetySeconds, NOW)).toBe(1);
  });

  it('never goes negative once the hour is up', () => {
    const gone = new Date(NOW.getTime() - 60_000).toISOString();
    expect(minutesLeft(gone, NOW)).toBe(0);
  });
});

describe('who is told — DEC-114', () => {
  it('renders NOTHING on an ordinary session, which is almost every session', () => {
    renderWithProviders(<SupportBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells the CUSTOMER who is inside and why, in the operator’s own words', () => {
    renderWithProviders(<SupportBanner />, { support: contextOf() });

    const banner = screen.getByRole('status').textContent ?? '';
    expect(banner).toContain('Priya Raman');
    expect(banner).toContain('from Endur support is signed in to your organisation');
    expect(banner).toContain('Ticket 418 — their campaign will not launch');

    expect(banner).toContain('stay closed to them');
  });

  it('gives the customer NO way to dismiss it and no way to eject them', () => {
    renderWithProviders(<SupportBanner />, { support: contextOf() });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent ?? '').toContain('Access ends automatically in');
  });

  it('tells the OPERATOR a different sentence, and offers the way out', () => {
    renderWithProviders(<SupportBanner />, { support: contextOf({ viewer: 'operator' }) });

    const banner = screen.getByRole('status').textContent ?? '';
    expect(banner).toContain('they can see that you are');
    expect(banner).toContain('closed to you');
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
  });
});
