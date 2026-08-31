// The four sentences the respondent actually reads. 39, design_specs/design/07 §7.2, §7.5.
//
// Pure and separate for the same reason as `answers.ts`: every one of them has a plural or
// an agreement in it, and this screen is the one on the projector. `1 Guest has responded`
// against `612 Guests have responded` is not a detail when the evaluator is holding the
// phone that made it 613.
//
// Domain nouns come from the payload's `labels`, never from `useLabels()` — the respond
// world mounts no store (39 § State). That is the whole reason these take a `labels`
// argument instead of reading one.
import type { CampaignAccess, ResolvedLabels } from '@endur/shared';
import { minutes } from '../../lib/format.js';

/**
 * `8 questions · about 2 minutes · anonymous` — in the header, before they scroll (39,
 * rule 1). The honest number is what buys the completion, which is why it is computed from
 * the question types server-side and never typed.
 *
 * "Question" is structural, not a domain noun: a hotel calls it a question too.
 */
export function costLine(input: {
  questionCount: number;
  estimatedSeconds: number;
  anonymous: boolean;
}): string {
  const parts = [`${input.questionCount} question${input.questionCount === 1 ? '' : 's'}`];
  // A form with no measurable length says nothing about time rather than rounding up to
  // "about 1 minute", which would be a made-up number in the one line that has to be true.
  if (input.estimatedSeconds > 0) parts.push(`about ${minutes(input.estimatedSeconds)}`);
  // Stated here and again above Submit (39, rule 6). Only when it is TRUE — see § below.
  if (input.anonymous) parts.push('anonymous');
  return parts.join(' · ');
}

/**
 * The line above Submit, and the second half of rule 6.
 *
 * Returns null when the campaign is not anonymous, and that is a deliberate silence rather
 * than an oversight. 39's rule 6 is written for the anonymous case; neither it nor
 * design_specs/design/07 gives any copy for the other one, and the two things this page
 * could invent are both wrong — a promise it cannot keep, or a warning about a linkage the
 * schema does not actually make (a response row has no respondent column at all, INV-006).
 * Saying nothing is the only honest option available without a contract.
 */
export const anonymityLine = (anonymous: boolean): string | null =>
  anonymous ? 'Your answers are anonymous.' : null;

/**
 * `<AccessNotice>` (24 §7) — SAY WHICH PROMISE IS BEING MADE, ON THE SCREEN WHERE IT IS
 * MADE. One line above Submit, from the `anonymous` x `access` pair (DEC-037).
 *
 * Getting this wrong is a privacy failure rather than a copy failure. 52 §1 names two
 * promises that used to be indistinguishable because only one side of the pair existed:
 *
 *   the ANSWER is anonymous       nothing links what you wrote to who you are.
 *                                 ALWAYS true — it is INV-006 and it is in the schema.
 *   your PARTICIPATION is private nobody knows you took part at all.
 *                                 Only on an open link.
 *
 * An `organization` campaign keeps the first and gives up the second, and a respondent who
 * has not been told that has been misled about the one thing 52 promises them.
 *
 * FOUR PAIRS, THREE SENTENCES AND ONE DELIBERATE SILENCE. The silence is
 * `!anonymous && public`, and it is the same one `anonymityLine` already keeps, for the
 * same documented reason: neither 39 nor design_specs/design/07 gives copy for it, and the
 * two things this page could invent are both wrong — a promise it cannot keep, or a warning
 * about a linkage the schema does not actually make. Nothing is added here that would need
 * a contract that does not exist.
 *
 * `organizationName` comes from the payload (`PublicCampaign.organizationName`), which the
 * respond world already has. Nothing is fetched to render this.
 */
export function accessNotice(input: {
  anonymous: boolean;
  access: CampaignAccess;
  organizationName: string;
}): string | null {
  const anonymity = anonymityLine(input.anonymous);
  if (input.access !== 'organization') return anonymity;

  // TRUE in both halves and worth saying in both: the participant row records THAT this
  // member answered and carries no reference to the response (10 §4.4). "but not what you
  // said" is the schema's guarantee, not a policy the application could relax.
  const participation = `${input.organizationName} will see that you responded, but not what you said.`;
  return anonymity ? `${anonymity} ${participation}` : participation;
}

/** `Your feedback on Data Structures has been recorded anonymously.` (07 §7.5) */
export function thanksLine(input: { subjectName?: string | undefined; anonymous: boolean }): string {
  const about = input.subjectName ? ` on ${input.subjectName}` : '';
  return `Your feedback${about} has been recorded${input.anonymous ? ' anonymously' : ''}.`;
}

/**
 * `612 Students have responded to this Feedback cycle.` — the social proof, and the detail
 * that lands (07 §7.5). The presenter refreshes results to show 612 → 613, and the two
 * numbers agreeing is what makes it read as a real system rather than a mockup.
 */
export function respondedLine(count: number, labels: ResolvedLabels): string | null {
  // Nobody has responded is not social proof, and the reader has just responded anyway, so
  // this can only be zero if we never learned the count. Say nothing rather than "0".
  if (count <= 0) return null;
  const who = count === 1 ? labels.respondent.one : labels.respondent.many;
  return `${count} ${who} ${count === 1 ? 'has' : 'have'} responded to this ${labels.campaign.one}.`;
}
