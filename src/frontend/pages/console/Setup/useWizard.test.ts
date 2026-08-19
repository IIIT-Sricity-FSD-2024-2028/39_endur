// The wizard's state rules, tested without a DOM. 31 § State.
//
// These are the rules that make the wizard survive a demo: order is the level, a unit
// cannot swallow its own ancestor, deleting a branch deletes the branch, and a plural
// stops being derived the moment somebody types one.
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { depthOf, toTree, useWizard, type UnitDraft } from './useWizard.js';
import type { PresetView } from '@endur/shared';

const preset: PresetView = {
  key: 'hotel',
  displayName: 'Hotel',
  roles: [{ name: 'GM' }, { name: 'Manager' }, { name: 'Staff' }, { name: 'Guest' }],
  units: [
    { tempId: 'u1', name: 'The Grand Palace', parentTempId: null },
    { tempId: 'u2', name: 'North Wing', parentTempId: 'u1' },
    { tempId: 'u3', name: 'Rooftop', parentTempId: 'u2' },
  ],
  labels: {
    unit: { one: 'Property', many: 'Properties' },
    subject: { one: 'Restaurant', many: 'Restaurants' },
    respondent: { one: 'Guest', many: 'Guests' },
    reviewee: { one: 'Staff member', many: 'Staff members' },
    campaign: { one: 'Guest survey', many: 'Guest surveys' },
  },
  templates: [{ name: 'Stay feedback', category: 'stay', questionCount: 5 }],
};

const units: UnitDraft[] = preset.units.map((unit) => ({ ...unit }));

describe('toTree / depthOf', () => {
  it('nests a flat list by parent reference', () => {
    const tree = toTree(units);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe('The Grand Palace');
    expect(tree[0]?.children[0]?.children[0]?.name).toBe('Rooftop');
  });

  it('keeps an orphan at the top rather than losing it', () => {
    const tree = toTree([...units, { tempId: 'x', name: 'Stray', parentTempId: 'gone' }]);
    // Silently dropping a unit is worse than showing it in the wrong place — one is
    // visible and fixable, the other is not.
    expect(tree.map((node) => node.name)).toContain('Stray');
  });

  it('measures the deepest branch, for step 5\'s "5 units, 3 deep"', () => {
    expect(depthOf(units)).toBe(3);
    expect(depthOf([])).toBe(0);
  });
});

describe('useWizard', () => {
  const mount = () => {
    const hook = renderHook(() => useWizard());
    act(() => hook.result.current.applyPreset(preset));
    return hook;
  };

  it('applies a preset whole — roles, units and all five labels', () => {
    const { result } = mount();
    expect(result.current.state.industry).toBe('hotel');
    expect(result.current.state.roles.map((role) => role.name)).toEqual([
      'GM', 'Manager', 'Staff', 'Guest',
    ]);
    expect(result.current.state.units).toHaveLength(3);
    expect(result.current.state.labels.unit.one).toBe('Property');
  });

  it('reorders roles by position — the level is the index, never a field', () => {
    const { result } = mount();
    const managerId = result.current.state.roles[1]?.id ?? '';

    act(() => result.current.roles.move(managerId, -1));
    expect(result.current.state.roles.map((role) => role.name)).toEqual([
      'Manager', 'GM', 'Staff', 'Guest',
    ]);
    // Nothing anywhere carries a number, so nothing can disagree with the order.
    expect(Object.keys(result.current.state.roles[0] ?? {})).toEqual(['id', 'name']);
  });

  it('refuses to move the top role up or the bottom one down', () => {
    const { result } = mount();
    const first = result.current.state.roles[0]?.id ?? '';
    act(() => result.current.roles.move(first, -1));
    expect(result.current.state.roles[0]?.name).toBe('GM');
  });

  it('adds a role ABOVE the bottom row — the lowest level must stay the lowest', () => {
    const { result } = mount();
    act(() => { result.current.roles.add(); });
    const names = result.current.state.roles.map((role) => role.name);
    expect(names[names.length - 1]).toBe('Guest');
    expect(names).toHaveLength(5);
  });

  it('deletes a unit WITH its descendants rather than re-homing them silently', () => {
    const { result } = mount();
    act(() => result.current.units.remove('u2'));
    // Re-homing would move people's scope without saying so.
    expect(result.current.state.units.map((unit) => unit.tempId)).toEqual(['u1']);
  });

  it('refuses to make a unit a child of its own descendant', () => {
    const { result } = mount();
    act(() => result.current.units.reparent('u1', 'u3'));
    // Unchanged. A cycle here would hang the tree render, not merely look wrong.
    expect(result.current.state.units.find((u) => u.tempId === 'u1')?.parentTempId).toBeNull();
  });

  it('allows a legitimate re-parent', () => {
    const { result } = mount();
    act(() => result.current.units.reparent('u3', 'u1'));
    expect(result.current.state.units.find((u) => u.tempId === 'u3')?.parentTempId).toBe('u1');
    expect(depthOf(result.current.state.units)).toBe(2);
  });

  it('derives the plural until somebody types one, and then never again', () => {
    const { result } = mount();

    act(() => result.current.labels.setOne('unit', 'Studio'));
    expect(result.current.state.labels.unit.many).toBe('Studios');

    act(() => result.current.labels.setOne('unit', 'Facility'));
    expect(result.current.state.labels.unit.many).toBe('Facilities');

    // "Staff / Staff" — the case a cleverer rule would get wrong exactly where a hotel is
    // watching (22 §2).
    act(() => result.current.labels.setMany('reviewee', 'Staff'));
    act(() => result.current.labels.setOne('reviewee', 'Staff'));
    expect(result.current.state.labels.reviewee.many).toBe('Staff');
  });

  it('can hand a plural back to the deriver', () => {
    const { result } = mount();
    act(() => result.current.labels.setMany('unit', 'Propertys'));
    expect(result.current.state.pluralOverrides).toContain('unit');

    act(() => result.current.labels.resetPlural('unit'));
    expect(result.current.state.labels.unit.many).toBe('Properties');
    expect(result.current.state.pluralOverrides).not.toContain('unit');
  });
});
