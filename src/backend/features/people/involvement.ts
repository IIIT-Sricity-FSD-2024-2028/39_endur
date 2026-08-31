// A campaign, from the person's side of it — N-079.
//
// Everywhere else the question runs the other way: a campaign holds an audience rule, and
// features/campaigns/audience.ts turns that rule into a COUNT or a set of user ids. Nothing
// asked it backwards, so a person's page could not say what that person was in. This file is
// the inverse, and it is deliberately the ONLY inverse: one matcher, read by the people page
// and the profile page through readPerson().
//
// It matches in memory rather than issuing one query per campaign, and that is the one place
// it could drift from the rule it mirrors. involvement.test.ts pins the two together on the
// same data — the pattern features/campaigns/status.ts already uses for whereStatus().
import type { AudienceRule, PersonCampaign, Position } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { config } from '../../lib/config.js';
import { unitAncestors } from '../../db/graph.js';
import { seesNothing, type Visibility } from '../../authz/index.js';
import { ruleOf } from '../campaigns/audience.js';
import { statusOf, whereStatus } from '../campaigns/status.js';
import { scopeToCampaigns } from '../campaigns/visibility.js';
import { publicUrlFor } from '../campaigns/token.js';

// A person is in a handful of campaigns, not hundreds. The cap is a guard against a
// pathological organisation, not a page size: nothing here is paginated, because a list that
// needed paging would mean the answer had stopped being useful anyway.
const MAX = 50;

export type PersonFacts = {
  /** NULL for a respondent — DEC-009 — which is the commonest caller of this function. */
  userId: string | null;
  positions: Position[];
  /** Whether they could actually sign in, which decides members-only campaigns below. */
  canSignIn: boolean;
};

/**
 * What this person is being asked for, right now.
 *
 * `scope` is the caller's `campaign.read` visibility, or the string 'self' when the person
 * IS the caller. The two are different questions and both are answered here so they cannot
 * be answered differently: an administrator sees the campaigns they may already read, and a
 * person sees their own list whole. See `PersonDetail.involvement` for why.
 */
export async function involvementFor(
  orgId: string,
  person: PersonFacts,
  scope: Visibility | 'self',
  now: Date = new Date(),
): Promise<PersonCampaign[]> {
  if (scope !== 'self' && seesNothing(scope)) return [];

  const campaigns = await prisma.campaign.findMany({
    where: {
      orgId,
      ...(scope === 'self' ? {} : scopeToCampaigns(scope)),
      // Open OR scheduled: launched, not closed, and still to be answered. Written as the
      // two shared filters rather than as a third hand-rolled date predicate, because a
      // fourth copy of "what does open mean" is how the third one got out of step.
      OR: [whereStatus('open', now), whereStatus('scheduled', now)],
    },
    take: MAX,
    select: {
      id: true,
      name: true,
      audienceRule: true,
      access: true,
      anonymous: true,
      publicToken: true,
      startsAt: true,
      endsAt: true,
      closedAt: true,
      subjects: { select: { subject: { select: { name: true, linkedUserId: true } } } },
    },
  });
  if (campaigns.length === 0) return [];

  const reach = await reachOf(orgId, person.positions);
  const rows: PersonCampaign[] = [];

  for (const campaign of campaigns) {
    // A members-only campaign is answered from a signed-in session (features/public/service.ts),
    // so listing one against somebody who cannot sign in would be an invitation to a door
    // that will not open. Respondents hold no account at all — this is most of them.
    if (campaign.access === 'organization' && !person.canSignIn) continue;

    const rule = ruleOf(campaign.audienceRule);
    const about = campaign.subjects.find(
      ({ subject }) => person.userId !== null && subject.linkedUserId === person.userId,
    );
    const named = about ? null : matchOf(rule, reach);

    // Being reviewed wins over being asked, when a campaign somehow does both: "this is
    // about you" is the more important sentence and the row can only carry one.
    let reason: PersonCampaign['reason'];
    let via: string | null;
    if (about) {
      reason = 'subject';
      via = about.subject.name;
    } else if (named !== null) {
      reason = 'audience';
      via = named;
    } else if (rule.kind === 'anyone') {
      reason = 'everyone';
      via = null;
    } else {
      // A rule that names somebody else. Not their business, and the commonest exclusion.
      continue;
    }

    rows.push({
      id: campaign.id,
      name: campaign.name,
      // 'draft' and 'closed' cannot come back from the filter above; the cast is not one.
      status: statusOf(campaign, now) === 'scheduled' ? 'scheduled' : 'open',
      reason,
      via,
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      anonymous: campaign.anonymous,
      url: campaign.publicToken
        ? publicUrlFor(config.PUBLIC_BASE_URL, campaign.publicToken)
        : null,
    });
  }

  return rows.sort(order);
}

/** What is closing soonest, first — and anything open before anything that has not started. */
function order(a: PersonCampaign, b: PersonCampaign): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  const key = (row: PersonCampaign): number =>
    row.status === 'open'
      ? // No end date is not urgent, and must not sort as the year 1970.
        (row.endsAt ? Date.parse(row.endsAt) : Number.MAX_SAFE_INTEGER)
      : (row.startsAt ? Date.parse(row.startsAt) : Number.MAX_SAFE_INTEGER);
  return key(a) - key(b) || a.name.localeCompare(b.name);
}

/**
 * Where this person is, and everywhere above it.
 *
 * `includeSubtree` asks whether their unit sits INSIDE the rule's unit, and walking up from
 * the person is the cheap direction: one query per position they hold — at most a handful —
 * against one per campaign the other way round. `unitAncestors` includes the unit itself and
 * is dimension-agnostic, which is what makes a student reachable from their department, their
 * hostel AND their mess (`10`, and the three member edges in seed/iiit.ts).
 */
async function reachOf(orgId: string, positions: Position[]): Promise<Reach> {
  const roles = new Map<string, string>();
  const units = new Map<string, string>();
  const above = new Map<string, string>();

  for (const position of positions) {
    // The role ALONE, never "Student — AIDS". A rule naming the Student role is addressed to
    // every student in the organisation, and answering "why am I on this list?" with the
    // department they happen to sit in would say the poll was a departmental one. It is not,
    // and the person reading the row has no other way to tell.
    if (position.roleId && !roles.has(position.roleId)) {
      roles.set(position.roleId, position.roleName);
    }
    // A unit rule is the opposite case: the unit is exactly what makes it about them, so the
    // whole position — role AND place — is the honest answer.
    if (position.unitId && !units.has(position.unitId)) {
      units.set(position.unitId, `${position.roleName} — ${position.unitName}`);
    }
  }

  for (const [unitId, label] of units) {
    for (const ancestor of await unitAncestors(orgId, unitId)) {
      if (!above.has(ancestor)) above.set(ancestor, label);
    }
  }

  return { roles, units, above };
}

type Reach = {
  /** Role id → the role's name. */
  roles: Map<string, string>;
  /** Unit id they sit in → the position that sits there. */
  units: Map<string, string>;
  /** Every unit at or above one of theirs → the position that reaches it. */
  above: Map<string, string>;
};

/**
 * Does this rule name them, and through which position?
 *
 * MIRRORS `positionFilter()` in features/campaigns/audience.ts clause for clause, including
 * what it does NOT do: neither drops a position whose `validTo` has passed. That looks like
 * an omission and copying it is the point — the denominator on `40` counts expired positions,
 * so filtering them here would put a person on this page who is not in the campaign's own
 * roll, and two screens would disagree about the same campaign. If that rule changes it
 * changes in `audience.ts` and this follows, which is what involvement.test.ts holds.
 *
 * Returns the label to show, or `null` for no match. Never an empty string, so the caller
 * can test it without a truthiness trap.
 */
function matchOf(rule: AudienceRule, reach: Reach): string | null {
  if (rule.kind === 'role') return reach.roles.get(rule.roleId) ?? null;
  if (rule.kind === 'unit') {
    const here = reach.units.get(rule.unitId);
    if (here) return here;
    return rule.includeSubtree ? (reach.above.get(rule.unitId) ?? null) : null;
  }
  return null;
}
