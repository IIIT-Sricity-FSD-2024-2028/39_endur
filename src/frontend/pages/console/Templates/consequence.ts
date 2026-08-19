// The delete sentence, as a pure function. 36 § States, 24 §6.
//
// Same reasoning as `Structure/consequence.ts`: "never *are you sure?*" is an acceptance
// criterion, and a sentence assembled inside a component is one nobody can check without
// rendering a dialog. Writing that one as a module found a real verb-agreement bug, which
// is the whole argument for doing it again here.
import type { TemplateSummary } from '@endur/shared';
import { pluralise } from '../../../lib/format.js';

export type DeleteVerdict = {
  /** What the dialog says. Always a real number, never a question. */
  consequence: string;
  /**
   * True when the server will refuse. `DELETE /templates/:id` answers 409 for a template a
   * campaign uses, because deleting would cascade the questions away and leave every
   * collected answer pointing at nothing.
   *
   * The dialog still OPENS — the reader asked what would happen, and the sentence is the
   * answer — but the confirm button is disabled, which is the same rule the unit delete
   * follows: never let somebody press a destructive button whose outcome is not available
   * (`32`, `confirmDisabled`).
   */
  blocked: boolean;
};

export function deleteConsequence(
  template: TemplateSummary,
  campaign: { one: string; many: string },
): DeleteVerdict {
  const questions = pluralise(template.questionCount, 'question', 'questions');

  if (template.campaignCount > 0) {
    const used = pluralise(
      template.campaignCount,
      campaign.one.toLowerCase(),
      campaign.many.toLowerCase(),
    );
    // Verb agreement matters on a projector. "1 feedback cycle uses it", not "use it".
    const verb = template.campaignCount === 1 ? 'uses' : 'use';
    return {
      consequence:
        `${used} ${verb} ${template.name}, so it cannot be deleted — the answers already ` +
        `collected would point at nothing. Delete or close those first.`,
      blocked: true,
    };
  }

  return {
    consequence:
      `Deleting ${template.name} removes its ${questions}. ` +
      `Nothing has used it, so no responses are affected.`,
    blocked: false,
  };
}
