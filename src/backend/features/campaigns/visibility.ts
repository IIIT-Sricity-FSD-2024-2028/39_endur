// Which campaigns a reader may see - one rule, used everywhere it is needed.
// A campaign has no unit of its own: it is reached through the units of its SUBJECTS.
// The one exception is a campaign hung off the organisation-wide subject, which belongs to everybody.
import type { Visibility } from '../../authz/index.js';

// The type marking the one per-organisation subject a quick campaign hangs off.
// The API refuses this value, so only quickCreate can ever have written it - a client-settable value
// deciding visibility would be a client-settable permission.
export const ORGANISATION_SUBJECT = 'organisation';

// The database filter: campaigns in a unit the caller can see, plus campaigns on the organisation subject,
// which is not in any unit because it IS the organisation. Every quick campaign is public anyway,
// so there is nothing there to withhold from a member of staff.
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

// The same question for a campaign already in hand, for single-row reads that cannot use a filter.
// The same two clauses in the same order, and a test compares the pair on the same data.
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
