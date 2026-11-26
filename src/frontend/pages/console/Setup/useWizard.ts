// The setup wizard's state, read from and written to `store/wizardSlice.ts`. 31 § State;
// docs/REDUX-PLAN.md §6.8 (R-306).
//
// The state used to be a `useState` here, and was lost whenever the reader left the
// wizard. It now lives in the store, so it survives that. This hook keeps the shape the
// page and its five steps already use (`state`, `applyPreset`, `roles`, `units`, `labels`),
// and each of its functions dispatches one event from the slice. The generic `patch` setter
// is gone: its one use is now `toggleTemplates`, an event like the rest.
//
// The rule that shapes everything: **back and forward must never lose typed input.**
// The pure helpers below (steps, `hasEdits`, the tree) read the state; they never hold it.
import { useMemo } from 'react';
import { LabelKey, type LabelSet, type PresetView, type ResolvedLabels } from '@endur/shared';
import { DEFAULT_LABELS } from '@endur/shared';
import type { UnitTreeNode } from '../../../components/org/UnitTree.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import {
  labelPluralEdited,
  labelPluralReset,
  labelSingularEdited,
  presetApplied,
  roleAdded,
  roleMoved,
  roleRemoved,
  roleRenamed,
  rolesReordered,
  selectWizard,
  templatesToggled,
  unitAdded,
  unitRemoved,
  unitRenamed,
  unitReparented,
  wizardReset,
  type UnitDraft,
  type WizardState,
} from '../../../store/wizardSlice.js';

export type { RoleDraft, UnitDraft, WizardState } from '../../../store/wizardSlice.js';

/** The wizard's five screens, in the order they are walked. `key` is what lives in the
 *  `?step=` query param, so a step is linkable and Back/Forward work like real navigation. */
export const STEPS = [
  { key: 'industry', label: 'Industry' },
  { key: 'roles', label: 'Roles' },
  { key: 'structure', label: 'Structure' },
  { key: 'words', label: 'Official Terms' },
  { key: 'review', label: 'Review' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export const stepIndex = (key: string): number => {
  const found = STEPS.findIndex((step) => step.key === key);
  return found === -1 ? 0 : found;
};

/** Same length, same name at every index — the check `hasEdits` runs once for roles and
 *  once for units, factored out so the two never silently drift apart. */
const sameNamesInOrder = (a: { name: string }[], b: { name: string }[]): boolean =>
  a.length === b.length && a.every((item, index) => item.name === b[index]?.name);

/** True once anything past step 1 has been edited — what makes changing industry a prompt
 *  rather than a silent overwrite (31 § State). */
export const hasEdits = (state: WizardState, preset: PresetView | undefined): boolean => {
  if (!preset || !state.industry) return false;
  const sameRoles = sameNamesInOrder(state.roles, preset.roles);
  const sameUnits = sameNamesInOrder(state.units, preset.units);
  const sameLabels = LabelKey.options.every(
    (key) =>
      state.labels[key].one === (preset.labels[key]?.one ?? DEFAULT_LABELS[key].one) &&
      state.labels[key].many === (preset.labels[key]?.many ?? DEFAULT_LABELS[key].many),
  );
  return !(sameRoles && sameUnits && sameLabels);
};

/** Flat drafts -> the nested shape <UnitTree> renders. Orphans are kept at the top rather
 *  than dropped: losing a unit silently is worse than showing it in the wrong place. */
export function toTree(units: UnitDraft[]): UnitTreeNode[] {
  const byId = new Map<string, UnitTreeNode>(
    units.map((unit) => [unit.tempId, { id: unit.tempId, name: unit.name, children: [] }]),
  );
  const roots: UnitTreeNode[] = [];
  for (const unit of units) {
    const node = byId.get(unit.tempId);
    if (!node) continue;
    const parent = unit.parentTempId ? byId.get(unit.parentTempId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Depth of the deepest branch — for step 5's "5 units, 3 deep". */
export function depthOf(units: UnitDraft[]): number {
  const parentOf = new Map(units.map((unit) => [unit.tempId, unit.parentTempId]));
  let deepest = 0;
  for (const unit of units) {
    let depth = 1;
    let cursor = unit.parentTempId;
    // The guard is not paranoia: `onReparent` refuses cycles, but a bad draft loaded from
    // anywhere else would hang the render rather than show a wrong number.
    while (cursor && depth < 100) {
      depth += 1;
      cursor = parentOf.get(cursor) ?? null;
    }
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

export function useWizard() {
  const state = useAppSelector(selectWizard);
  const dispatch = useAppDispatch();

  // Built once per store. Every function is `dispatch(event(payload))`; the rules (a role
  // is added above the bottom row, a unit cannot swallow its ancestor, a typed plural is
  // never re-derived) are in the reducers, where they are tested without a DOM.
  const controls = useMemo(() => {
    const applyPreset = (preset: PresetView): void => {
      dispatch(presetApplied(preset));
    };

    const toggleTemplates = (include: boolean): void => {
      dispatch(templatesToggled({ include }));
    };

    /** After Finish or skip succeeds: the org exists, and the draft has done its job. */
    const reset = (): void => {
      dispatch(wizardReset());
    };

    const roles = {
      rename: (id: string, name: string) => { dispatch(roleRenamed({ id, name })); },
      /** Returns the new role's id, so the caller can focus the row it just created: the
       *  "+ then type" beat. The id was made in `roleAdded`'s prepare callback. */
      add: (): string => dispatch(roleAdded()).payload.id,
      remove: (id: string) => { dispatch(roleRemoved({ id })); },
      move: (id: string, direction: -1 | 1) => { dispatch(roleMoved({ id, direction })); },
      reorder: (fromId: string, toId: string) => { dispatch(rolesReordered({ fromId, toId })); },
    };

    const units = {
      rename: (tempId: string, name: string) => { dispatch(unitRenamed({ tempId, name })); },
      addChild: (parentTempId: string): string => dispatch(unitAdded(parentTempId)).payload.tempId,
      remove: (tempId: string) => { dispatch(unitRemoved({ tempId })); },
      reparent: (tempId: string, newParentTempId: string) => {
        dispatch(unitReparented({ tempId, newParentTempId }));
      },
    };

    const labels = {
      setOne: (key: LabelKey, one: string) => { dispatch(labelSingularEdited({ key, one })); },
      setMany: (key: LabelKey, many: string) => { dispatch(labelPluralEdited({ key, many })); },
      resetPlural: (key: LabelKey) => { dispatch(labelPluralReset({ key })); },
    };

    return { applyPreset, toggleTemplates, reset, roles, units, labels };
  }, [dispatch]);

  return { state, ...controls };
}

/** What the API takes. `LabelSet` is partial by contract; we always send all five. */
export const labelsForWire = (labels: ResolvedLabels): LabelSet => ({ ...labels });
