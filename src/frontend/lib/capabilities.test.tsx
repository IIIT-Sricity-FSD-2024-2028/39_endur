import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import type { HeldCapabilities } from '@endur/shared';
import { useCan } from './capabilities.js';
import { makeStore } from '../test-utils.js';

const mount = (capabilities: HeldCapabilities) => {
  const store = makeStore({ capabilities });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useCan(), { wrapper }).result.current;
};

describe('useCan', () => {
  it('means what it always meant when asked for a verb alone', () => {
    const can = mount({ 'campaign.read': 'own_unit' });
    expect(can('campaign.read')).toBe(true);
    expect(can('campaign.create')).toBe(false);
  });

  it('answers the question the sidebar actually meant — beyond `self`', () => {
    const respondent = mount({ 'person.read': 'self' });
    const head = mount({ 'person.read': 'own_unit' });

    expect(respondent('person.read')).toBe(true);
    expect(head('person.read')).toBe(true);

    expect(respondent('person.read', 'own_unit')).toBe(false);
    expect(head('person.read', 'own_unit')).toBe(true);
  });

  it('treats a wider scope as covering a narrower one', () => {
    const can = mount({ 'unit.read': 'subtree' });
    expect(can('unit.read', 'self')).toBe(true);
    expect(can('unit.read', 'own_unit')).toBe(true);
    expect(can('unit.read', 'subtree')).toBe(true);
    expect(can('unit.read', 'all')).toBe(false);
  });

  it('reaches nothing at all for a capability it does not hold — not even `self`', () => {
    const can = mount({});
    expect(can('person.read')).toBe(false);
    expect(can('person.read', 'self')).toBe(false);
    expect(can('person.read', 'all')).toBe(false);
  });

  it('holds nothing when signed out', () => {
    const store = makeStore({ signedOut: true });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const can = renderHook(() => useCan(), { wrapper }).result.current;
    expect(can('org.read')).toBe(false);
  });
});
