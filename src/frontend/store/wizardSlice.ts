// The setup wizard's state. 31 § State; docs/REDUX-PLAN.md §6.8 and §6.9 (R-306).
//
// It used to be one `useState` in `useWizard`, so leaving the wizard (to check something
// in another tab of the console, say) threw away every role, unit and word typed so far.
// In the store it survives that, and it is persisted to the server exactly once, on Finish.
//
// The rule that shapes everything below: **back and forward must never lose typed input.**
// So nothing here is derived from the current step (that lives in `?step=`), and nothing
// is reset by navigating. Ids are made in `prepare` callbacks, never in a reducer, because
// reducers must be pure; an action that hands an id back carries it on `payload`.
import { createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import {
  DEFAULT_LABELS,
  LabelKey,
  type Industry,
  type PresetView,
  type ResolvedLabels,
} from '@endur/shared';
import { derivePlural } from '../lib/format.js';
import { signedOut } from './authSlice.js';
import { rootReducer } from './index.js';

export type RoleDraft = { id: string; name: string };
export type UnitDraft = { tempId: string; name: string; parentTempId: string | null };

export type WizardState = {
  industry: Industry | null;
  /** ORDER IS THE LEVEL. Index 0 is level 1. Never a number on the row. */
  roles: RoleDraft[];
  /** Flat with parent references: the shape a tree editor already holds, and the shape the
   *  API takes, so nothing has to be converted on the way out. */
  units: UnitDraft[];
  labels: ResolvedLabels;
  /** Which plurals the user typed by hand. Those stop auto-deriving, for "Staff / Staff". */
  pluralOverrides: LabelKey[];
  includeTemplates: boolean;
};

/** Where the wizard starts, before any preset is chosen: nothing pre-filled. */
const initialState: WizardState = {
  industry: null,
  roles: [],
  units: [],
  labels: DEFAULT_LABELS,
  pluralOverrides: [],
  includeTemplates: true,
};

/** Unique within one wizard session, which is all an id here needs to be. The prefix is
 *  for whoever reads the action log; `unit-…` stays under the API's 64-character limit. */
const newId = (prefix: 'role' | 'unit'): string => `${prefix}-${nanoid(10)}`;

/** Moves the item at `from` to `to` in place. */
function reorder<T>(items: T[], from: number, to: number): void {
  const [moved] = items.splice(from, 1);
  if (moved !== undefined) items.splice(to, 0, moved);
}

export const wizardSlice = createSlice({
  name: 'wizard',
  initialState,
  reducers: {
    /** A preset replaces everything at once: roles, units, all five labels. */
    presetApplied: {
      reducer(_state, action: PayloadAction<{ preset: PresetView; roleIds: string[] }>) {
        const { preset, roleIds } = action.payload;
        return {
          industry: preset.key,
          roles: preset.roles.map((role, index) => ({
            id: roleIds[index] ?? `role-${index}`,
            name: role.name,
          })),
          units: preset.units.map((unit) => ({ ...unit })),
          labels: LabelKey.options.reduce((into, key) => {
            into[key] = preset.labels[key] ?? DEFAULT_LABELS[key];
            return into;
          }, {} as ResolvedLabels),
          pluralOverrides: [],
          includeTemplates: true,
        };
      },
      prepare: (preset: PresetView) => ({
        payload: { preset, roleIds: preset.roles.map(() => newId('role')) },
      }),
    },

    roleAdded: {
      reducer(state, action: PayloadAction<{ id: string }>) {
        // Added ABOVE the bottom row, never at it. The lowest level is the one that answers
        // forms, and a new role landing there silently demotes the old one.
        const at = Math.max(state.roles.length - 1, 0);
        state.roles.splice(at, 0, { id: action.payload.id, name: 'New role' });
      },
      prepare: () => ({ payload: { id: newId('role') } }),
    },

    roleRenamed(state, action: PayloadAction<{ id: string; name: string }>) {
      const role = state.roles.find((candidate) => candidate.id === action.payload.id);
      if (role) role.name = action.payload.name;
    },

    roleRemoved(state, action: PayloadAction<{ id: string }>) {
      state.roles = state.roles.filter((role) => role.id !== action.payload.id);
    },

    /** One place up or down. The top role cannot go up, nor the bottom one down. */
    roleMoved(state, action: PayloadAction<{ id: string; direction: -1 | 1 }>) {
      const from = state.roles.findIndex((role) => role.id === action.payload.id);
      const to = from + action.payload.direction;
      if (from === -1 || to < 0 || to >= state.roles.length) return;
      reorder(state.roles, from, to);
    },

    /** Dragged onto another role's place. */
    rolesReordered(state, action: PayloadAction<{ fromId: string; toId: string }>) {
      const from = state.roles.findIndex((role) => role.id === action.payload.fromId);
      const to = state.roles.findIndex((role) => role.id === action.payload.toId);
      if (from === -1 || to === -1 || from === to) return;
      reorder(state.roles, from, to);
    },

    unitAdded: {
      reducer(state, action: PayloadAction<{ tempId: string; parentTempId: string }>) {
        state.units.push({ tempId: action.payload.tempId, name: '', parentTempId: action.payload.parentTempId });
      },
      prepare: (parentTempId: string) => ({ payload: { tempId: newId('unit'), parentTempId } }),
    },

    unitRenamed(state, action: PayloadAction<{ tempId: string; name: string }>) {
      const unit = state.units.find((candidate) => candidate.tempId === action.payload.tempId);
      if (unit) unit.name = action.payload.name;
    },

    /** Removing a branch removes the branch. Re-homing the children silently would move
     *  people's scope without saying so. */
    unitRemoved(state, action: PayloadAction<{ tempId: string }>) {
      const doomed = new Set([action.payload.tempId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const unit of state.units) {
          if (unit.parentTempId && doomed.has(unit.parentTempId) && !doomed.has(unit.tempId)) {
            doomed.add(unit.tempId);
            grew = true;
          }
        }
      }
      state.units = state.units.filter((unit) => !doomed.has(unit.tempId));
    },

    /** A unit cannot become its own descendant's child. The tree refuses the drop too, but
     *  the state is the thing that must not be corruptible: a cycle hangs the render. */
    unitReparented(state, action: PayloadAction<{ tempId: string; newParentTempId: string }>) {
      const { tempId, newParentTempId } = action.payload;
      const parentOf = new Map(state.units.map((unit) => [unit.tempId, unit.parentTempId]));
      let cursor: string | null = newParentTempId;
      while (cursor) {
        if (cursor === tempId) return;
        cursor = parentOf.get(cursor) ?? null;
      }
      const unit = state.units.find((candidate) => candidate.tempId === tempId);
      if (unit) unit.parentTempId = newParentTempId;
    },

    /** The plural follows the singular until somebody takes it over, and then it never
     *  moves again: "Staff / Staff" must survive editing "Staff". */
    labelSingularEdited(state, action: PayloadAction<{ key: LabelKey; one: string }>) {
      const { key, one } = action.payload;
      const label = state.labels[key];
      label.one = one;
      if (!state.pluralOverrides.includes(key)) label.many = derivePlural(one);
    },

    /** A hand-typed plural. From now on this key's plural is the reader's. */
    labelPluralEdited(state, action: PayloadAction<{ key: LabelKey; many: string }>) {
      const { key, many } = action.payload;
      state.labels[key].many = many;
      if (!state.pluralOverrides.includes(key)) state.pluralOverrides.push(key);
    },

    /** Hand the plural back to the deriver. The way out of "Staffs" typed by accident. */
    labelPluralReset(state, action: PayloadAction<{ key: LabelKey }>) {
      const { key } = action.payload;
      state.labels[key].many = derivePlural(state.labels[key].one);
      state.pluralOverrides = state.pluralOverrides.filter((entry) => entry !== key);
    },

    templatesToggled(state, action: PayloadAction<{ include: boolean }>) {
      state.includeTemplates = action.payload.include;
    },

    /** Finish (or skip) succeeded: the org is set up, and the draft has nothing left to do. */
    wizardReset: () => initialState,
  },

  // A wizard half-filled by one person must not greet the next one in this tab.
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState);
  },

  selectors: {
    selectWizard: (state) => state,
  },
});

// Console-only, so injected from the wizard's route chunk (§5: lazy-loaded slices).
declare module './index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof wizardSlice> {}
}

const injectedWizardSlice = wizardSlice.injectInto(rootReducer);

export const {
  presetApplied,
  roleAdded,
  roleRenamed,
  roleRemoved,
  roleMoved,
  rolesReordered,
  unitAdded,
  unitRenamed,
  unitRemoved,
  unitReparented,
  labelSingularEdited,
  labelPluralEdited,
  labelPluralReset,
  templatesToggled,
  wizardReset,
} = wizardSlice.actions;

/** Root-state selector. Before the first wizard action it reads the initial state. */
export const { selectWizard } = injectedWizardSlice.selectors;
