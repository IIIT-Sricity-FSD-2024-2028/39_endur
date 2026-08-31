// INV-001 has one mechanical defence and one human one. The human one is the vocabulary
// walk (22 §5, T-044). This is the mechanical one: prove that the resolver never hands a
// component `undefined`, and that a partially-renamed org keeps the renames it has.
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import { LabelKey } from '@endur/shared';
import { authReducer } from '../store/authSlice.js';
import { labelsLoaded, vocabularyReducer } from '../store/vocabularySlice.js';
import { useLabel, useLabelPlural, useLabels } from './labels.js';

function withLabels(labels?: Record<string, { one: string; many: string }>) {
  const store = configureStore({ reducer: { auth: authReducer, vocabulary: vocabularyReducer } });
  if (labels) store.dispatch(labelsLoaded(labels));
  return ({ children }: { children: ReactNode }): JSX.Element => (
    <Provider store={store}>{children}</Provider>
  );
}

describe('useLabels', () => {
  it('gives every key a word before any org has loaded', () => {
    const { result } = renderHook(() => useLabels(), { wrapper: withLabels() });
    for (const key of LabelKey.options) {
      expect(result.current[key].one.length).toBeGreaterThan(0);
      expect(result.current[key].many.length).toBeGreaterThan(0);
    }
  });

  // Falling back to the whole default SET would silently discard the renames an org does
  // have — the university that renamed only `subject` would suddenly say "Unit" again.
  it('merges per key, so a partial rename keeps its other words', () => {
    const { result } = renderHook(() => useLabels(), {
      wrapper: withLabels({ subject: { one: 'Course', many: 'Courses' } }),
    });
    expect(result.current.subject.one).toBe('Course');
    expect(result.current.unit.one).toBe('Unit');
  });

  it('never derives a plural — "Faculty" pluralises to "Faculty"', () => {
    const { result } = renderHook(() => useLabelPlural('reviewee'), {
      wrapper: withLabels({ reviewee: { one: 'Faculty', many: 'Faculty' } }),
    });
    expect(result.current).toBe('Faculty');
  });

  it('re-skins on org switch without a component changing', () => {
    const hotel = { subject: { one: 'Restaurant', many: 'Restaurants' } };
    const { result } = renderHook(() => useLabel('subject'), { wrapper: withLabels(hotel) });
    expect(result.current).toBe('Restaurant');
  });
});
