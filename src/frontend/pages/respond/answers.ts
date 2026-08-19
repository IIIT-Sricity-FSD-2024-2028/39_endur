// The respondent form's state maths, as pure functions. 39 § Validation, 07 §7.4.
//
// None of this renders anything, and that is deliberate. "Nothing is validated until Submit
// is pressed" and "the error clears the instant the question is answered" are acceptance
// criteria, and a rule buried inside a component is one nobody can check without mounting a
// form and pressing a button. Same reasoning as 32's delete sentence and 38's close
// consequence, and it has already caught one verb-agreement bug in each.
import type { AnswerValue } from '@endur/shared';
import type { Question } from '../../components/form/QuestionInput.js';

export type Answers = Record<string, AnswerValue>;

/**
 * Present is not the same as answered.
 *
 * Every control writes into the map on first touch, so `value !== undefined` would count a
 * text box the reader typed into and then cleared, and a multi-choice they ticked and
 * unticked. It would also count the free-text half of an "Other" radio while it is still
 * empty — which is the case that turns a required question into one the button lets you
 * skip.
 */
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (!value) return false;
  switch (value.kind) {
    case 'text':
      return value.text.trim().length > 0;
    case 'single':
      return value.option.trim().length > 0;
    case 'multi':
      return value.options.length > 0;
    case 'rating':
    case 'nps':
    case 'yesno':
      return true;
  }
}

/** The numerator of the progress bar. It counts QUESTIONS, not scroll (39, rule 3). */
export const answeredCount = (questions: Question[], answers: Answers): number =>
  questions.filter((question) => isAnswered(answers[question.id])).length;

/**
 * Required questions with no answer, in the order they appear on screen — which is the
 * order the page scrolls through them, so the first element is the one to scroll to.
 */
export const missingRequired = (questions: Question[], answers: Answers): string[] =>
  questions
    .filter((question) => question.required && !isAnswered(answers[question.id]))
    .map((question) => question.id);

/**
 * The count design_specs/design/07 §7.4 puts on the button after a failed submit.
 *
 * Returns null when there is nothing missing, because the button then says `Submit` and
 * nothing else. `1 question left` is not `1 questions left`: this screen is on a projector.
 */
export function remainingLabel(missing: number): string | null {
  if (missing <= 0) return null;
  return `${missing} question${missing === 1 ? '' : 's'} left`;
}

/**
 * The wire payload, in question order, carrying only what was actually answered.
 *
 * Skipping the empties is not just tidiness. An optional text question the reader typed
 * into and cleared would otherwise arrive as `{ text: "" }` — a stored answer that says
 * nothing, counted by every aggregate on 40 as though somebody had responded to it.
 */
export const toSubmitAnswers = (
  questions: Question[],
  answers: Answers,
): Array<{ questionId: string; value: AnswerValue }> =>
  questions
    .map((question) => ({ questionId: question.id, value: answers[question.id] }))
    .filter((entry): entry is { questionId: string; value: AnswerValue } => isAnswered(entry.value));
