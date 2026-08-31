// The close sentence. 38, design_specs/design/06 §6.4, 24 §6.
//
// "Close early" confirms with the CURRENT COUNT, and states what is kept rather than what
// is lost — because keeping is what actually happens. A pure function for the same reason
// the unit and template ones are: the rule is checkable without rendering a dialog.
import { pluralise } from '../../../lib/format.js';

export function closeConsequence(responseCount: number): string {
  if (responseCount === 0) {
    // "0 responses collected" reads as a failure report. Nothing has been collected yet,
    // and saying so plainly is the honest version.
    return 'Nothing has come in yet. Closing stops it accepting any more; the results screen stays available.';
  }
  const collected = pluralise(responseCount, 'response', 'responses');
  const verb = responseCount === 1 ? 'has' : 'have';
  return `${collected} ${verb} come in. Closing stops new ones — the results stay.`;
}
