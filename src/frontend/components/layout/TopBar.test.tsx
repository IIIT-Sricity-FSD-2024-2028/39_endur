// The org switcher is the second most important control in the demo, and it rests on an
// awkward fact: a user belongs to exactly ONE organisation (10), so there is nothing to
// switch between. These tests hold the honest behaviour in place — see OPEN-006.
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { TopBar } from './TopBar.js';
import { DEMO_ORGS } from '../../lib/demo.js';
import { renderWithProviders } from '../../test-utils.js';

describe('TopBar', () => {
  it('names the organisation the caller is actually in', () => {
    renderWithProviders(<TopBar onOpenMenu={() => undefined} />, { orgName: 'The Grand Palace' });
    expect(screen.getByText('The Grand Palace')).toBeTruthy();
  });

  it('shows the user by initials and offers sign out', async () => {
    const { getByText } = renderWithProviders(<TopBar onOpenMenu={() => undefined} />, {
      name: 'Amara Rao',
    });
    expect(getByText('AR')).toBeTruthy();

    fireEvent.click(getByText('Amara Rao'));
    expect(await screen.findByText('Sign out')).toBeTruthy();
  });

  // In a production build DEMO_ORGS is [] and this whole branch is eliminated, so the
  // switcher renders as plain text with no chevron. Asserting on the constant rather than
  // on the environment keeps the test honest in both builds.
  it('offers the demo organisations only when there are any', async () => {
    renderWithProviders(<TopBar onOpenMenu={() => undefined} />, { orgName: 'Northfield' });
    const trigger = screen.getByText('Northfield').closest('button');

    if (DEMO_ORGS.length === 0) {
      expect(trigger).toBeNull();
      return;
    }

    expect(trigger).toBeTruthy();
    fireEvent.click(trigger as HTMLElement);
    expect(await screen.findByText('Riverside Hospital')).toBeTruthy();
    // It must say what it is. A switcher that silently re-authenticates is a trap.
    expect(screen.getByText(/Development build only/)).toBeTruthy();
  });
});
