// Three lines, and the most important file in the frontend (22 §3).
//
// INV-001 — no user-facing domain noun is written in a component. "Department",
// "Course", "Student" are DATA. Every one of them resolves through here, which is why
// switching organisation re-skins the entire UI with no code change.
//
// Structural words — Save, Cancel, Settings, Question — are not domain nouns and
// correctly stay literal. The test is: would a hotel call it something else?
import { useAppSelector } from '../store/index.js';
import type { LabelKey, ResolvedLabels } from '@endur/shared';

export const useLabels = (): ResolvedLabels => useAppSelector((s) => s.vocabulary.labels);

/** `label('unit')` → "Department". Sugar for the common single-noun case. */
export function useLabel(key: LabelKey): string {
  return useLabels()[key].one;
}

/** `labelPlural('unit')` → "Departments". Never derived from the singular: "Faculty"
 *  pluralises to "Faculty", and getting that wrong in front of a university is the
 *  exact failure this system exists to prevent. */
export function useLabelPlural(key: LabelKey): string {
  return useLabels()[key].many;
}
