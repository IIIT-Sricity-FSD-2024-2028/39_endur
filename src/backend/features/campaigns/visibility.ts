// WHICH campaigns may this reader see. ONE implementation, three placements (INV-009).
// 38 § Acceptance, 11 §5, DEC-093.
//
// A campaign has no unit of its own. It is reachable through its SUBJECTS' units, which is
// the honest reading of the model — a campaign is a template pointed at some subjects, and
// the subjects are what live in the org graph.
//
// That reading has exactly one hole, and D-042 fell straight down it: the organisation
// subject (DEC-089) has NO unit, so `unitId in visibleUnits` matched nothing and a poll was
// invisible to every seeded role in every organisation. The rule below closes it by saying
// what an unattached organisation subject MEANS rather than by relaxing the unit filter.
//
// Written here rather than three times because the same predicate was already written
// twice — inlined in listCampaigns and again as home's `scopeToCampaigns` — and the two
// would have had to be fixed separately, which is how one of them stays broken.
import type { Visibility } from '../../authz/index.js';

/**
 * The type that marks the per-org singleton subject a quick campaign hangs off (DEC-089).
 *
 * RESERVED: `features/subjects/service.ts` refuses it from the API, so this string can only
 * ever have been written by `quickCreate`. That matters, because the rule below reads it —
 * a client-settable value deciding visibility is a client-settable permission.
 */
export const ORGANISATION_SUBJECT = 'organisation';

/**
 * A campaign anchored to the ORGANISATION itself belongs to the whole organisation, and is
 * visible to anyone who may read campaigns at all.
 *
 * This is not a relaxation of the unit filter and must not become one. It is a statement
 * about one row: the organisation subject is not IN a unit because it is not in a part of
 * the organisation — it is the organisation. Hiding a campaign hung off it from a
 * supervisor is also incoherent on its own terms, because every quick campaign is
 * `access: 'public'` with `audienceRule: anyone` (DEC-089) — the link answers to whoever
 * holds it, so there is nothing there to withhold from a member of staff.
 *
 * The narrower alternative — anchor the singleton to the org's ROOT unit — was rejected
 * because it leaves a level-3 launcher, whose `campaign.launch` is seeded `own_unit`,
 * unable to see the poll they created one second earlier. That is D-042 again, one level
 * down. DEC-093 records both.
 */
export const scopeToCampaigns = (visibility: Visibility): Record<string, unknown> =>
  visibility.all
    ? {}
    : {
        subjects: {
          some: {
            subject: {
              OR: [
                { unitId: { in: visibility.unitIds } },
                { unitId: null, type: ORGANISATION_SUBJECT },
              ],
            },
          },
        },
      };

/**
 * The same question asked of a campaign already in hand, for the single-row reads that
 * cannot express it as a `where`.
 *
 * Deliberately the same two clauses in the same order as `scopeToCampaigns`. They are two
 * statements of one rule, and the test that matters compares them against each other on
 * the same fixtures rather than trusting the pair to stay in step.
 */
export const campaignInScope = (
  subjects: Array<{ subject: { unitId: string | null; type: string } }>,
  visibility: Visibility,
): boolean =>
  visibility.all ||
  subjects.some(
    ({ subject }) =>
      (subject.unitId !== null && visibility.unitIds.includes(subject.unitId)) ||
      (subject.unitId === null && subject.type === ORGANISATION_SUBJECT),
  );
