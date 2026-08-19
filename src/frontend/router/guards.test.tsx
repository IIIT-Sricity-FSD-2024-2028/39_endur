// The acceptance criterion these exist for (20 §9): "a signed-in user reloading
// /app/campaigns never sees a login flash". That bug is invisible in development, where
// /auth/me answers in 2ms, and glaring on a venue network. It is only catchable here.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { Capability, MeResponse } from '@endur/shared';
import { authReducer, signedIn, signedOut } from '../store/authSlice.js';
import { vocabularyReducer } from '../store/vocabularySlice.js';
import { RequireCapability, RequireSession } from './guards.js';

const me = (capabilities: Capability[]): MeResponse => ({
  user: { id: 'u1', name: 'Amara Rao', email: 'a@example.test' },
  organization: { id: 'o1', name: 'Northfield', slug: 'northfield', industry: 'university' },
  labels: {},
  capabilities,
});

function mount(node: JSX.Element, session?: 'in' | 'out', capabilities: Capability[] = []) {
  const store = configureStore({ reducer: { auth: authReducer, vocabulary: vocabularyReducer } });
  if (session === 'in') store.dispatch(signedIn(me(capabilities)));
  if (session === 'out') store.dispatch(signedOut());

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/app/campaigns']}>
        <Routes>
          <Route path="/app/campaigns" element={node} />
          <Route path="/login" element={<p>Sign in</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('RequireSession', () => {
  it('holds while boot is still in flight — it does NOT show the login screen', () => {
    mount(<RequireSession><p>Campaigns</p></RequireSession>);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Sign in')).toBeNull();
    expect(screen.queryByText('Campaigns')).toBeNull();
  });

  it('routes to /login once boot says there is no session', () => {
    mount(<RequireSession><p>Campaigns</p></RequireSession>, 'out');
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('renders the page for a signed-in user', () => {
    mount(<RequireSession><p>Campaigns</p></RequireSession>, 'in');
    expect(screen.getByText('Campaigns')).toBeTruthy();
  });
});

describe('RequireCapability', () => {
  it('renders the page when the capability is held', () => {
    mount(<RequireCapability capability="campaign.read"><p>Campaigns</p></RequireCapability>,
      'in', ['campaign.read']);
    expect(screen.getByText('Campaigns')).toBeTruthy();
  });

  // The ONE place a permission produces a full-page state. Everywhere else out-of-scope
  // data is absent rather than greyed out (design_specs/design/02 §5).
  it('shows a full-page state for a directly-navigated URL it cannot open', () => {
    mount(<RequireCapability capability="campaign.read"><p>Campaigns</p></RequireCapability>,
      'in', ['subject.read']);
    expect(screen.queryByText('Campaigns')).toBeNull();
    expect(screen.getByText('You do not have access to this')).toBeTruthy();
  });
});
