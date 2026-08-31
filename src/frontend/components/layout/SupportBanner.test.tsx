// T-109 — the support banner. DEC-114, `19` §15.
//
// THE TEST THAT MATTERS IS THE SECOND ONE. `19` §14 refused operator impersonation, and what it
// actually refused was an operator inside a customer's account INVISIBLY — so the assertion that
// the CUSTOMER'S OWN staff see this, in the operator's own words, is the assertion that the
// feature is the thing DEC-114 claims rather than the thing §14 rejected.
//
// The first draft of this component failed exactly that test: it rendered from the caller's own
// session, so the only person who ever saw the disclosure was the operator it was disclosing.
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
  reason: 'Ticket 418 — their campaign will not launch',
  startedAt: '2026-09-10T09:00:00.000Z',
  expiresAt: '2026-09-10T10:00:00.000Z',
  ...over,
});

describe('the countdown — the customer’s only guarantee that it ends', () => {
  it('floors, so “1 minute” never means ninety seconds', () => {
    // The direction to be wrong in is EARLY. This number is a customer's warning that a
    // stranger is about to lose access to their account.
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
    // THE ASSERTION THE FEATURE STANDS ON. The reason is rendered verbatim, and the operator
    // typed it knowing it would be — which is what makes the field at the door a real control
    // rather than a form to fill in.
    renderWithProviders(<SupportBanner />, { support: contextOf() });

    // `textContent` rather than a jest-dom matcher — this suite does not load jest-dom, and
    // the sentence is deliberately split across a <strong> and a <span>, which is exactly the
    // case a naive `getByText` would miss.
    const banner = screen.getByRole('status').textContent ?? '';
    expect(banner).toContain('Priya Raman');
    expect(banner).toContain('from Endur support is signed in to your organisation');
    expect(banner).toContain('Ticket 418 — their campaign will not launch');

    // The answer to the customer's first question, on the strip rather than in a policy page:
    // an assurance that requires navigation is not an assurance.
    expect(banner).toContain('stay closed to them');
  });

  it('gives the customer NO way to dismiss it and no way to eject them', () => {
    // Both absences are decisions. A banner with a close button is absent for the whole of the
    // second visit; a customer-side eject would put their staff in the position of cutting the
    // operator off mid-fix on the one screen where the fix is happening. The hour is the
    // control they have, and it is on the strip.
    renderWithProviders(<SupportBanner />, { support: contextOf() });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent ?? '').toContain('Access ends automatically in');
  });

  it('tells the OPERATOR a different sentence, and offers the way out', () => {
    renderWithProviders(<SupportBanner />, { support: contextOf({ viewer: 'operator' }) });

    const banner = screen.getByRole('status').textContent ?? '';
    // "and they can see that you are" — the operator is reminded that this is not a private
    // door, which is the whole difference between this and impersonation.
    expect(banner).toContain('they can see that you are');
    expect(banner).toContain('closed to you');
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
  });
});
