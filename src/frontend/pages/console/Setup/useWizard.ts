// The wizard's whole state, in one object. 31 § State.
//
// NOT IN REDUX (23 §2). It is one route's transient state, it is persisted exactly once —
// on Finish — and putting it in the store now would be undone in P3. The store holds what
// outlives a route; this does not.
//
// The rule that shapes everything below: **back and forward must never lose typed input.**
// A wizard that forgets a rename made three steps earlier is a wizard that dies on stage,
// so nothing here is derived from the current step and nothing is reset by navigating.
import { useCallback, useMemo, useState } from 'react';
import { LabelKey, type Industry, type LabelSet, type PresetView, type ResolvedLabels }
  from '@endur/shared';
import { DEFAULT_LABELS } from '@endur/shared';
import { derivePlural } from '../../../lib/format.js';
import type { UnitTreeNode } from '../../../components/org/UnitTree.js';

export type RoleDraft = { id: string; name: string };
export type UnitDraft = { tempId: string; name: string; parentTempId: string | null };

export type WizardState = {
  industry: Industry | null;
  /** ORDER IS THE LEVEL. Index 0 is level 1. Never a number on the row. */
  roles: RoleDraft[];
  /** Flat with parent references — the shape a tree editor already holds, and the shape
   *  the API takes, so nothing has to be converted on the way out. */
  units: UnitDraft[];
  labels: ResolvedLabels;
  /** Which plurals the user typed by hand. Those stop auto-deriving, for "Staff / Staff". */
  pluralOverrides: LabelKey[];
  includeTemplates: boolean;
};

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

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${(counter += 1)}`;

const emptyState = (): WizardState => ({
  industry: null,
  roles: [],
  units: [],
  labels: DEFAULT_LABELS,
  pluralOverrides: [],
  includeTemplates: true,
});

/** True once anything past step 1 has been edited — what makes changing industry a prompt
 *  rather than a silent overwrite (31 § State). */
export const hasEdits = (state: WizardState, preset: PresetView | undefined): boolean => {
  if (!preset || !state.industry) return false;
  const sameRoles =
    state.roles.length === preset.roles.length &&
    state.roles.every((role, index) => role.name === preset.roles[index]?.name);
  const sameUnits =
    state.units.length === preset.units.length &&
    state.units.every((unit, index) => unit.name === preset.units[index]?.name);
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
  const [state, setState] = useState<WizardState>(emptyState);

  const applyPreset = useCallback((preset: PresetView) => {
    setState({
      industry: preset.key,
      roles: preset.roles.map((role) => ({ id: nextId('role'), name: role.name })),
      units: preset.units.map((unit) => ({ ...unit })),
      labels: LabelKey.options.reduce((into, key) => {
        into[key] = preset.labels[key] ?? DEFAULT_LABELS[key];
        return into;
      }, {} as ResolvedLabels),
      pluralOverrides: [],
      includeTemplates: true,
    });
  }, []);

  const patch = useCallback(
    (change: Partial<WizardState>) => setState((current) => ({ ...current, ...change })),
    [],
  );

  const roles = useMemo(
    () => ({
      rename: (id: string, name: string) =>
        setState((current) => ({
          ...current,
          roles: current.roles.map((role) => (role.id === id ? { ...role, name } : role)),
        })),
      add: (): string => {
        const id = nextId('role');
        setState((current) => ({
          ...current,
          // Added ABOVE the bottom row, never at it. The lowest level is the one that
          // answers forms, and a new role landing there silently demotes the old one.
          roles: [
            ...current.roles.slice(0, -1),
            { id, name: 'New role' },
            ...current.roles.slice(-1),
          ],
        }));
        // Returned so the caller can focus the row it just created — the "+ then type"
        // beat. A caller that has to search for it always finds the wrong one after a
        // reorder.
        return id;
      },
      remove: (id: string) =>
        setState((current) => ({ ...current, roles: current.roles.filter((r) => r.id !== id) })),
      move: (id: string, direction: -1 | 1) =>
        setState((current) => {
          const from = current.roles.findIndex((role) => role.id === id);
          const to = from + direction;
          if (from === -1 || to < 0 || to >= current.roles.length) return current;
          const next = [...current.roles];
          const [moved] = next.splice(from, 1);
          if (moved) next.splice(to, 0, moved);
          return { ...current, roles: next };
        }),
      reorder: (fromId: string, toId: string) =>
        setState((current) => {
          const from = current.roles.findIndex((role) => role.id === fromId);
          const to = current.roles.findIndex((role) => role.id === toId);
          if (from === -1 || to === -1 || from === to) return current;
          const next = [...current.roles];
          const [moved] = next.splice(from, 1);
          if (moved) next.splice(to, 0, moved);
          return { ...current, roles: next };
        }),
    }),
    [],
  );

  const units = useMemo(
    () => ({
      rename: (tempId: string, name: string) =>
        setState((current) => ({
          ...current,
          units: current.units.map((unit) => (unit.tempId === tempId ? { ...unit, name } : unit)),
        })),
      addChild: (parentTempId: string): string => {
        const tempId = nextId('unit');
        setState((current) => ({
          ...current,
          units: [...current.units, { tempId, name: '', parentTempId }],
        }));
        return tempId;
      },
      remove: (tempId: string) =>
        setState((current) => {
          // Removing a branch removes the branch. Re-homing the children silently would
          // move people's scope without saying so.
          const doomed = new Set([tempId]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const unit of current.units) {
              if (unit.parentTempId && doomed.has(unit.parentTempId) && !doomed.has(unit.tempId)) {
                doomed.add(unit.tempId);
                grew = true;
              }
            }
          }
          return { ...current, units: current.units.filter((unit) => !doomed.has(unit.tempId)) };
        }),
      reparent: (tempId: string, newParentTempId: string) =>
        setState((current) => {
          // A unit cannot become its own descendant's child. The tree refuses the drop
          // too, but the state is the thing that must not be corruptible.
          const parentOf = new Map(current.units.map((u) => [u.tempId, u.parentTempId]));
          let cursor: string | null = newParentTempId;
          while (cursor) {
            if (cursor === tempId) return current;
            cursor = parentOf.get(cursor) ?? null;
          }
          return {
            ...current,
            units: current.units.map((unit) =>
              unit.tempId === tempId ? { ...unit, parentTempId: newParentTempId } : unit,
            ),
          };
        }),
    }),
    [],
  );

  const labels = useMemo(
    () => ({
      setOne: (key: LabelKey, one: string) =>
        setState((current) => {
          const overridden = current.pluralOverrides.includes(key);
          return {
            ...current,
            labels: {
              ...current.labels,
              // The plural follows the singular until somebody takes it over, and then it
              // never moves again — "Staff / Staff" must survive editing "Staff".
              [key]: { one, many: overridden ? current.labels[key].many : derivePlural(one) },
            },
          };
        }),
      setMany: (key: LabelKey, many: string) =>
        setState((current) => ({
          ...current,
          labels: { ...current.labels, [key]: { ...current.labels[key], many } },
          pluralOverrides: current.pluralOverrides.includes(key)
            ? current.pluralOverrides
            : [...current.pluralOverrides, key],
        })),
      /** Hand the plural back to the deriver. The way out of "Staffs" typed by accident. */
      resetPlural: (key: LabelKey) =>
        setState((current) => ({
          ...current,
          labels: {
            ...current.labels,
            [key]: { ...current.labels[key], many: derivePlural(current.labels[key].one) },
          },
          pluralOverrides: current.pluralOverrides.filter((entry) => entry !== key),
        })),
    }),
    [],
  );

  return { state, patch, applyPreset, roles, units, labels };
}

/** What the API takes. `LabelSet` is partial by contract; we always send all five. */
export const labelsForWire = (labels: ResolvedLabels): LabelSet => ({ ...labels });
