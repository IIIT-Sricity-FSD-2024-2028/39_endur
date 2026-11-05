// R-306: the wizard slice's reducers as pure functions, and what its `prepare` callbacks
// put on the action. The behaviour through the hook is in pages/console/Setup/useWizard.test.ts.
import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS, type PresetView } from '@endur/shared';
import { signedOut } from './authSlice.js';
import {
  labelPluralEdited,
  labelPluralReset,
  labelSingularEdited,
  presetApplied,
  roleAdded,
  roleMoved,
  rolesReordered,
  templatesToggled,
  unitAdded,
  unitRemoved,
  unitReparented,
  wizardReset,
  wizardSlice,
  type WizardState,
} from './wizardSlice.js';

const reduce = wizardSlice.reducer;

const preset: PresetView = {
  key: 'hospital',
  displayName: 'Hospital',
  roles: [{ name: 'Director' }, { name: 'Consultant' }, { name: 'Patient' }],
  units: [
    { tempId: 'u1', name: 'City General', parentTempId: null },
    { tempId: 'u2', name: 'Cardiology', parentTempId: 'u1' },
  ],
  labels: { unit: { one: 'Department', many: 'Departments' } },
  templates: [],
};

const applied = (): WizardState => reduce(undefined, presetApplied(preset));
const names = (state: WizardState) => state.roles.map((role) => role.name);

describe('initial state (§6.9)', () => {
  it('is an empty wizard with the default words and templates included', () => {
    expect(reduce(undefined, { type: '@@init' })).toEqual({
      industry: null,
      roles: [],
      units: [],
      labels: DEFAULT_LABELS,
      pluralOverrides: [],
      includeTemplates: true,
    });
  });
});

describe('prepare callbacks: ids are made outside the reducer', () => {
  it('presetApplied carries the preset AND a fresh id per role, so the reducer stays pure', () => {
    const action = presetApplied(preset);
    expect(action.payload.preset).toBe(preset);
    expect(action.payload.roleIds).toHaveLength(3);
    expect(new Set(action.payload.roleIds).size).toBe(3);
    // Same action, same result: the reducer only copies the ids it was given.
    expect(reduce(undefined, action)).toEqual(reduce(undefined, action));
  });

  it('roleAdded and unitAdded each carry the id the caller gets back', () => {
    const role = roleAdded();
    expect(role.payload.id).toMatch(/^role-/);
    const unit = unitAdded('u1');
    expect(unit.payload).toEqual({ tempId: expect.stringMatching(/^unit-/) as unknown, parentTempId: 'u1' });
    // The API caps a tempId at 64 characters.
    expect(unit.payload.tempId.length).toBeLessThanOrEqual(64);
  });
});

describe('reducers', () => {
  it('presetApplied fills every label, falling back to the defaults the preset leaves out', () => {
    const state = applied();
    expect(state.industry).toBe('hospital');
    expect(state.labels.unit).toEqual({ one: 'Department', many: 'Departments' });
    expect(state.labels.campaign).toEqual(DEFAULT_LABELS.campaign);
  });

  it('roleAdded goes in above the bottom row, never at it', () => {
    expect(names(reduce(applied(), roleAdded()))).toEqual(['Director', 'Consultant', 'New role', 'Patient']);
    // With no roles yet, it is simply the first.
    expect(names(reduce(undefined, roleAdded()))).toEqual(['New role']);
  });

  it('roleMoved and rolesReordered change order, which is the level', () => {
    const state = applied();
    const [director, consultant, patient] = state.roles;
    expect(names(reduce(state, roleMoved({ id: consultant?.id ?? '', direction: -1 })))).toEqual([
      'Consultant', 'Director', 'Patient',
    ]);
    expect(names(reduce(state, rolesReordered({ fromId: patient?.id ?? '', toId: director?.id ?? '' })))).toEqual([
      'Patient', 'Director', 'Consultant',
    ]);
  });

  it('unitRemoved takes the branch with it; unitReparented refuses a cycle', () => {
    expect(reduce(applied(), unitRemoved({ tempId: 'u1' })).units).toEqual([]);
    const refused = reduce(applied(), unitReparented({ tempId: 'u1', newParentTempId: 'u2' }));
    expect(refused.units).toEqual(applied().units);
  });

  it('a typed plural is kept through later singular edits, until it is reset', () => {
    let state = reduce(applied(), labelPluralEdited({ key: 'unit', many: 'Dept.' }));
    state = reduce(state, labelSingularEdited({ key: 'unit', one: 'Ward' }));
    expect(state.labels.unit).toEqual({ one: 'Ward', many: 'Dept.' });

    state = reduce(state, labelPluralReset({ key: 'unit' }));
    expect(state.labels.unit).toEqual({ one: 'Ward', many: 'Wards' });
    expect(state.pluralOverrides).toEqual([]);
  });

  it('templatesToggled carries the new value as its payload', () => {
    expect(reduce(applied(), templatesToggled({ include: false })).includeTemplates).toBe(false);
  });

  it('wizardReset and signing out both start over', () => {
    const initial = reduce(undefined, { type: '@@init' });
    expect(reduce(applied(), wizardReset())).toEqual(initial);
    expect(reduce(applied(), signedOut())).toEqual(initial);
  });
});
