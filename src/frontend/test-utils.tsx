// Shared mount helper. 28 § "write this when" — its trigger was three component test
// files with visible setup duplication, which T-030 reached.
//
// Deliberately small: a store, a router, and a session. Fixture BUILDERS for questions,
// campaigns and org trees are not here, because inventing helpers for tests nobody has
// written yet is how test infrastructure ends up fitting nothing.
import { render, type RenderResult } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import type { Capability, LabelSet, MeResponse } from '@endur/shared';
import { authReducer, signedIn, signedOut } from './store/authSlice.js';
import { labelsLoaded, vocabularyReducer } from './store/vocabularySlice.js';

export type SessionFixture = {
  /** Absent means signed out. `undefined` status is what boot-in-flight looks like. */
  capabilities?: Capability[];
  labels?: LabelSet;
  name?: string;
  orgName?: string;
  signedOut?: boolean;
  path?: string;
};

/**
 * The nonsense-label fixture that makes INV-001 testable at component level rather than
 * only by the manual walk (22 §5). If a component renders one of these strings, it read
 * the vocabulary; if it renders an English noun, it hardcoded one.
 */
export const NONSENSE_LABELS: LabelSet = {
  unit: { one: 'Zblorn', many: 'Zblorns' },
  subject: { one: 'Quaxel', many: 'Quaxels' },
  respondent: { one: 'Frimble', many: 'Frimbles' },
  reviewee: { one: 'Vandor', many: 'Vandors' },
  campaign: { one: 'Plithe', many: 'Plithes' },
};

export function makeStore(session: SessionFixture = {}) {
  const store = configureStore({
    reducer: { auth: authReducer, vocabulary: vocabularyReducer },
  });

  if (session.signedOut) {
    store.dispatch(signedOut());
  } else {
    const me: MeResponse = {
      user: { id: 'u1', name: session.name ?? 'Amara Rao', email: 'amara@example.test' },
      organization: {
        id: 'o1', name: session.orgName ?? 'Northfield', slug: 'northfield',
        industry: 'university',
      },
      labels: session.labels ?? {},
      capabilities: session.capabilities ?? [],
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
