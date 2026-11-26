import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { TopBar } from './TopBar.js';
import { renderWithProviders } from '../../test-utils.js';

/** The user chip: the menu's heading repeats the name once it is open. */
const chip = () => screen.getByRole('button', { name: /Amara Rao/ });

describe('TopBar', () => {
  it('names the organization the caller is actually in', () => {
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

  // DEC-R04: /app/profile (name, photo, password) was linked from nowhere, so it could not be
  // reached at all. It is in the user menu.
  it('opens My account from the user menu, and the menu closes behind it', async () => {
    renderWithProviders(
      <>
        <TopBar onOpenMenu={() => undefined} />
        <Routes>
          <Route path="/app" element={<p>HOME</p>} />
          <Route path="/app/profile" element={<p>MY ACCOUNT PAGE</p>} />
        </Routes>
      </>,
      { name: 'Amara Rao' },
    );
    fireEvent.click(screen.getByText('Amara Rao'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'My account' }));
    expect(await screen.findByText('MY ACCOUNT PAGE')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu on Escape and on a second press', async () => {
    renderWithProviders(<TopBar onOpenMenu={() => undefined} />, { name: 'Amara Rao' });
    fireEvent.click(chip());
    await screen.findByRole('menu');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(chip());
    await screen.findByRole('menu');
    fireEvent.click(chip());
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
