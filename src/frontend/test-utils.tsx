import { render, type RenderResult } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import type { Capability, HeldCapabilities, LabelSet, MeResponse } from '@endur/shared';
import { authReducer, signedIn, signedOut } from './store/authSlice.js';
import { labelsLoaded, vocabularyReducer } from './store/vocabularySlice.js';

export type SessionFixture = {
  capabilities?: readonly Capability[] | HeldCapabilities;
  labels?: LabelSet;
  name?: string;
  orgName?: string;
  signedOut?: boolean;
  path?: string;
  support?: MeResponse['support'];
};

export const NONSENSE_LABELS: LabelSet = {
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
  respondent: { one: 'Frimble', many: 'Frimbles' },
  reviewee: { one: 'Vandor', many: 'Vandors' },
  campaign: { one: 'Plithe', many: 'Plithes' },
};

const heldFrom = (
  capabilities: readonly Capability[] | HeldCapabilities | undefined,
): HeldCapabilities => {
  if (!capabilities) return {};
  if (Array.isArray(capabilities)) {
    const held: HeldCapabilities = {};
    for (const capability of capabilities as readonly Capability[]) held[capability] = 'all';
    return held;
  }
  return capabilities as HeldCapabilities;
};

export function makeStore(session: SessionFixture = {}) {
  const store = configureStore({
    reducer: { auth: authReducer, vocabulary: vocabularyReducer },
  });

  if (session.signedOut) {
    store.dispatch(signedOut());
  } else {
    const me: MeResponse = {
      user: {
        id: 'u1',
        name: session.name ?? 'Amara Rao',
        email: 'amara@example.test',
        avatarUrl: null,
      },
      organization: {
        id: 'o1', name: session.orgName ?? 'Northfield', slug: 'northfield',
        industry: 'university',
      },
      labels: session.labels ?? {},
      capabilities: heldFrom(session.capabilities),
      ...(session.support ? { support: session.support } : {}),
    };
    store.dispatch(signedIn(me));
    store.dispatch(labelsLoaded(session.labels));
  }

  return store;
}

export function renderWithProviders(
  ui: ReactNode,
  session: SessionFixture = {},
): RenderResult & { store: ReturnType<typeof makeStore> } {
  const store = makeStore(session);
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[session.path ?? '/app']}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { ...result, store };
}
