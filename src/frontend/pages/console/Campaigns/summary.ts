// The summary card. 38 § Interactions, design_specs/design/06 §6.2.
//
// "The summary card restates everything in one sentence before the irreversible action."
// Launch mints the token and cannot be undone, so this is the last thing anybody reads
// before it — which makes it worth testing on its own rather than by rendering step 3.
//
// The `Structure/consequence.ts` precedent applies: writing that sentence as a module found
// a real verb-agreement bug that reading it had not.
import { approxDuration, formatDateTime, pluralise } from '../../../lib/format.js';

export type SummaryInput = {
  name: string;
  templateName: string;
  questionCount: number;
  estimatedSeconds: number;
  subjectCount: number;
  /** Both forms, from the vocabulary. Never derived — "Faculty" pluralises to "Faculty". */
  subjectWord: { one: string; many: string };
  startsAt: string | null;
  endsAt: string | null;
  anonymous: boolean;
};

export type Summary = { name: string; detail: string; window: string };

export function summarise(input: SummaryInput): Summary {
  const time = approxDuration(input.estimatedSeconds);

  const detail = [
    input.templateName || 'No form chosen',
    input.questionCount > 0 ? pluralise(input.questionCount, 'question', 'questions') : null,
    time,
    pluralise(input.subjectCount, input.subjectWord.one, input.subjectWord.many),
  ]
    .filter(Boolean)
    .join(' · ');

  // TRIMMED here rather than trusting the caller: a whitespace-only name is truthy, so
  // `name || 'Untitled'` renders a blank line on the last card anybody reads before an
  // irreversible action. Found by a test that passed "   ".
  return { name: input.name.trim() || 'Untitled', detail, window: windowOf(input) };
}

/**
 * The window, in words.
 *
 * Both dates are optional and each absence means something specific rather than "unset":
 * no start is "as soon as you launch", no end is "until somebody closes it". Saying that
 * out loud is the difference between a campaign somebody schedules and one they abandon
 * open — and status is derived from exactly these two dates (DEC-016), so the sentence is
 * also a plain-English description of what the derivation will do.
 */
function windowOf(input: SummaryInput): string {
  const anonymity = input.anonymous ? ' · anonymous' : ' · not anonymous';

  if (input.startsAt && input.endsAt) {
    return `${formatDateTime(input.startsAt)} → ${formatDateTime(input.endsAt)}${anonymity}`;
  }
  if (input.endsAt) {
    return `Opens as soon as you launch, closes ${formatDateTime(input.endsAt)}${anonymity}`;
  }
  if (input.startsAt) {
    return `Opens ${formatDateTime(input.startsAt)}, runs until you close it${anonymity}`;
  }
  return `Opens as soon as you launch, runs until you close it${anonymity}`;
}
