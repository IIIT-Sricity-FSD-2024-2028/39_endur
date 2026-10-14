import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { TopBar } from './TopBar.js';
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
});
