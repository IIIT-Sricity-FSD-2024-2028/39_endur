// The stat cards and the prompt copy, as pure functions. 46 § Interactions.
//
// Pure for the same reason `40`'s are: every line here has a plural, a vocabulary noun or a
// "there is no such number" case in it, and a sentence assembled inside JSX is one nobody
// can check without rendering the page. This is also the first screen after sign-in and the
// screen the org switcher lands on, so its nouns are the ten-second proof (22 §4).
import type { HomeView } from '@endur/shared';
import type { ResolvedLabels } from '@endur/shared';

export type Stat = { kicker: string; value: string; context?: string | undefined };

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function statCards(view: HomeView, labels: ResolvedLabels): Stat[] {
  const { stats } = view;
  return [
    {
      kicker: 'Responses',
      value: stats.responsesTotal.toLocaleString(),
      ...(stats.responsesTotal > 0 ? { context: 'all time' } : {}),
    },
    {
      kicker: 'Today',
      value: stats.responsesToday.toLocaleString(),
      // No arrow, no comparison. 46 § Components put a <TrendChip> here; 46 § Out of scope
      // rules trends off this page and the payload carries no yesterday to compare against,
      // so a direction would be invented rather than measured — CONF-017.
      context: stats.responsesToday === 0 ? 'nothing yet today' : 'since midnight',
    },
    {
      kicker: `Active ${labels.campaign.many}`,
      value: String(stats.activeCampaigns),
      ...(stats.activeCampaigns === 0
        ? { context: `no ${labels.campaign.one.toLowerCase()} is collecting` }
        : {}),
    },
    responseRateCard(view, labels),
  ];
}

/**
 * The card that showed 3161% on this screen until T-041.
 *
 * `readStats` summed subject counts for a denominator — the same substitution `N-043` found
 * in `readResults`, in a second reader. A campaign whose audience is "anyone with the link"
 * has no roll and therefore no rate, and this says so rather than showing a dash that reads
 * like a number which failed to load.
 */
function responseRateCard(view: HomeView, labels: ResolvedLabels): Stat {
  if (view.stats.responseRate === null) {
    return {
      kicker: 'Response rate',
      value: '—',
      context: `no ${labels.campaign.one.toLowerCase()} here has a fixed audience to measure against`,
    };
  }
  return {
    kicker: 'Response rate',
    value: `${Math.round(view.stats.responseRate * 100)}%`,
    context: 'of the people asked',
  };
}

export type Prompt = { title: string; body: string; action: string; href: string };

/**
 * The setup nudges, in the server's order and capped by the server at two.
 *
 * A prompt is a sentence with a next action in it, never a warning: somebody who has just
 * finished the wizard is being welcomed, not told off. `seats_over` is the one that reports
 * a problem, and even that one names the remedy rather than the breach.
 */
export function promptCopy(
  prompt: HomeView['prompts'][number],
  labels: ResolvedLabels,
  orgName: string,
): Prompt {
  const subject = labels.subject.one.toLowerCase();
  const campaign = labels.campaign.one.toLowerCase();

  switch (prompt.kind) {
    case 'no_subjects':
      return {
        title: `Add a ${subject}`,
        body: `A ${campaign} collects feedback about something. Add the first ${subject} and you can start one.`,
        action: `Add a ${labels.subject.one}`,
        href: prompt.href,
      };
    case 'no_campaigns':
      return {
        title: `Start a ${campaign}`,
        body: `Nothing is collecting yet. A ${campaign} gives you a link and a code people can answer from a phone.`,
        action: `New ${labels.campaign.one.toLowerCase()}`,
        href: prompt.href,
      };
    case 'setup_incomplete':
      return {
        title: 'Finish setting up',
        body: `${orgName} has no roles or structure yet. The setup takes about two minutes and everything else depends on it.`,
        action: 'Continue setup',
        href: prompt.href,
      };
    case 'seats_over':
      return {
        title: 'More people than seats',
        body: 'Your plan covers fewer people than the organisation now has. Nothing has stopped working.',
        action: 'See the plan',
        href: prompt.href,
      };
  }
}

/** "ends in 6 days", "ends today", "ended 2 days ago", or nothing at all. */
export function endsIn(endsAt: string | null, now: number = Date.now()): string | null {
  if (!endsAt) return null;
  const days = Math.round((new Date(endsAt).getTime() - now) / 86_400_000);
  if (days === 0) return 'ends today';
  if (days > 0) return `ends in ${count(days, 'day', 'days')}`;
  return `ended ${count(Math.abs(days), 'day', 'days')} ago`;
}
