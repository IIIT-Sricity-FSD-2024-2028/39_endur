// What a SCOPE says to somebody who is not a programmer. 33 § Interactions, DEC-076.
//
// `capability-labels.ts` did this for the rows of the powers grid — *"open guest surveys for
// answers"* rather than `campaign.launch` — and left the other axis alone. The cells still
// read `self`, `unit`, `tree`, `all`, which is worse than the keys were: `tree` is not even
// English, it is the shape of the data structure the scope walks. An administrator setting up
// their organisation for the first time cannot be expected to know that `tree` means "and
// everything under it" and `self` does not mean "their own department".
//
// So the same rule applies to both axes: **a cell is a sentence about a person, in this
// organisation's words.** `{unit}` is filled from `organization.labels` (INV-001), SINGULAR
// here — a scope is about the one place somebody stands, where a capability row is about a
// class of thing.
//
// The words are chosen to be readable IN A CELL, three centimetres wide, next to five other
// cells. `describeChoice` is the long form for a menu line, a tooltip and an `aria-label`;
// `choiceWord` is what fits in the cell. Both come from here, so they cannot drift apart.
import type { ResolvedLabels } from './labels.js';
import { SCOPES, type Scope } from './capabilities.js';

/**
 * Everything one cell of the powers grid can say, in the order the menu offers them:
 * nothing, then widening, then the block that beats them all.
 *
 * `null` is NO GRANT — an absent row, not a row with an empty scope (`14`). `'blocked'` is
 * `effect: 'deny'`, which is not a narrower allow but a different kind of statement (INV-004),
 * and it sits at the end of the list rather than inside the widening for that reason.
 */
export type GrantChoice = Scope | null | 'blocked';

export const GRANT_CHOICES: GrantChoice[] = [null, ...SCOPES, 'blocked'];

/** What the cell itself reads. Short enough for a column, still a real phrase. */
export function choiceWord(choice: GrantChoice, labels: ResolvedLabels): string {
  const unit = labels.unit.one.toLowerCase();
  switch (choice) {
    case null: return 'No';
    case 'self': return 'Themselves';
    case 'own_unit': return `Their ${unit}`;
    case 'subtree': return `Their ${unit} + below`;
    case 'all': return 'Everywhere';
    case 'blocked': return 'Blocked';
  }
}

/** The full sentence — a menu line, a tooltip, a screen reader. */
export function describeChoice(choice: GrantChoice, labels: ResolvedLabels): string {
  const unit = labels.unit.one.toLowerCase();
  switch (choice) {
    case null: return 'cannot do this at all';
    case 'self': return 'only where it is about them';
    case 'own_unit': return `only in their own ${unit}`;
    case 'subtree': return `in their own ${unit} and every ${unit} under it`;
    case 'all': return 'anywhere in the organisation';
    // Reads correctly after the word "Blocked" in the legend AND after "…may" in a menu:
    // the one description that has to work in both is written for both.
    case 'blocked': return 'never — this beats an allow from any other role, group or stand-in';
  }
}

/** The cell as one sentence about one role: what an `aria-label` and a tooltip both need. */
export function describeCell(
  roleName: string, capabilityLabel: string, choice: GrantChoice, labels: ResolvedLabels,
): string {
  if (choice === 'blocked') {
    return `${roleName}: blocked from “${capabilityLabel}” — a block beats an allow from any other role, group or stand-in`;
  }
  if (choice === null) return `${roleName}: cannot ${capabilityLabel}`;
  return `${roleName}: may ${capabilityLabel}, ${describeChoice(choice, labels)}`;
}
