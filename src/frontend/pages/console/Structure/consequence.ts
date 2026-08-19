// The delete sentence. 32 § Interactions, 24 §6.
//
// A separate, pure module because this copy is the acceptance criterion — "Delete
// confirmation states real numbers" — and a sentence built inside a component is a
// sentence nobody can test without rendering a dialog.
//
// Every number here comes from `GET /units/:id/impact`, and every clause is dropped when
// its number is zero. "Deleting Physics moves 0 people and 0 Courses" is technically true
// and reads like a machine.
import type { ResolvedLabels, UnitImpact } from '@endur/shared';
import { pluralise } from '../../../lib/format.js';

export type Own = { people: number; subjects: number };

/** "3 Departments, 64 people and 12 Courses" — Oxford-free, and only the non-zero parts. */
function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function deleteConsequence({
  name,
  impact,
  parentName,
  own,
  labels,
}: {
  name: string;
  impact: UnitImpact;
  /** Where the children go. `null` means the unit has none to rehome. */
  parentName: string | null;
  /** Counts anchored at the unit ITSELF, from the tree — these do not survive the delete. */
  own: Own;
  labels: ResolvedLabels;
}): string {
  const unitWord = labels.unit.one.toLowerCase();

  // Positions anchored directly here are cascaded by the database; positions further down
  // travel with their unit. Stating one number for both would be wrong in whichever
  // direction the reader cared about.
  const endingPositions = own.people;
  const strandedSubjects = own.subjects;

  if (impact.descendantCount > 0 && parentName) {
    const moving = list([
      pluralise(impact.descendantCount, labels.unit.one, labels.unit.many),
      ...(impact.peopleAffected - own.people > 0
        ? [pluralise(impact.peopleAffected - own.people, 'person', 'people')]
        : []),
      ...(impact.subjectsAffected - own.subjects > 0
        ? [pluralise(impact.subjectsAffected - own.subjects, labels.subject.one, labels.subject.many)]
        : []),
    ]);

    const tail = list([
      ...(endingPositions > 0 ? [`${pluralise(endingPositions, 'position', 'positions')} end`] : []),
      ...(strandedSubjects > 0
        ? [
            // "1 Quaxel are left" is the kind of sentence that survives review and then
            // appears on a projector. The verb agrees with the number.
            `${pluralise(strandedSubjects, labels.subject.one, labels.subject.many)} ${
              strandedSubjects === 1 ? 'is' : 'are'
            } left without a ${unitWord}`,
          ]
        : []),
    ]);

    return `Deleting ${name} moves ${moving} into ${parentName}.${tail ? ` Its own ${tail}.` : ''}`;
  }

  const direct = list([
    ...(endingPositions > 0 ? [`ends ${pluralise(endingPositions, 'position', 'positions')} in it`] : []),
    ...(strandedSubjects > 0
      ? [
          `leaves ${pluralise(strandedSubjects, labels.subject.one, labels.subject.many)} without a ${unitWord}`,
        ]
      : []),
  ]);

  if (!direct) return `Deleting ${name} removes an empty ${unitWord}. Nothing else changes.`;
  return `Deleting ${name} ${direct}.`;
}

/** Shown while the impact call is in flight. The confirm button is disabled behind it. */
export const checkingConsequence = (name: string): string =>
  `Checking what deleting ${name} affects…`;

/**
 * Shown when the impact call failed. The confirm button stays disabled — 32 is explicit
 * that confirming a destructive action with unknown consequences must be impossible.
 */
export const unknownConsequence = (name: string): string =>
  `Could not work out what deleting ${name} affects, so it cannot be deleted right now. Nothing has changed.`;
