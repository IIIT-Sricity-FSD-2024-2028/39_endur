// The stat cards and the prompt copy, as pure functions. 46 § Interactions.
//
// Pure for the same reason `40`'s are: every line here has a plural, a vocabulary noun or a
// "there is no such number" case in it, and a sentence assembled inside JSX is one nobody
// can check without rendering the page. This is also the first screen after sign-in and the
// screen the org switcher lands on, so its nouns are the ten-second proof (22 §4).
import type { HomeView, StatWindow } from '@endur/shared';
import type { ResolvedLabels } from '@endur/shared';

export type Stat = { kicker: string; value: string; context?: string | undefined };

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The range, as a phrase that finishes a sentence about a number — DEC-031.
 *
 * The control says "30 days" because a button has room for two words; the card underneath
 * says "in the last 30 days" because a bare "30 days" under the figure 412 reads as though
 * 412 were a duration. Same range, two registers, and the card is the one that has to be
 * unambiguous on its own.
 */
export const RANGE_LABEL: Record<StatWindow, string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
};

const RANGE_PHRASE: Record<StatWindow, string> = {
  today: 'since midnight',
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
  all: 'all time',
};

const NOTHING: Record<StatWindow, string> = {
  today: 'nothing yet today',
  '7d': 'nothing in the last 7 days',
  '30d': 'nothing in the last 30 days',
  all: 'nothing yet',
};

export function statCards(view: HomeView, labels: ResolvedLabels): Stat[] {
  const { stats } = view;
  const window = stats.window;
  const subject = labels.subject.many.toLowerCase();

  return [
    {
      kicker: 'Responses',
      value: stats.responses.toLocaleString(),
      // Every card carries its range in words. The control above says it once, but a
      // screen reader lands on the figure and not on the control, and a screenshot of
      // this row travels without it — DEC-031.
      context: stats.responses === 0 ? NOTHING[window] : RANGE_PHRASE[window],
    },
    responseRateCard(view, labels),
    {
      kicker: `${labels.subject.many} covered`,
      value: stats.subjectsCovered.toLocaleString(),
      // The number that says whether feedback is spread or concentrated, which a bare
      // response count cannot: 200 responses about two courses is a different week from
      // 200 about forty.
      context:
        stats.subjectsCovered === 0
          ? `no ${labels.subject.one.toLowerCase()} heard from`
          : `${subject} with at least one response`,
    },
    {
      kicker: `Active ${labels.campaign.many}`,
      // NOT windowed, and it says so. This is a fact about the present, and "campaigns
      // that were open at some point in the last 30 days" is a different, less useful
      // number that would look identical sitting in this row.
      value: String(stats.activeCampaigns),
      context:
        stats.activeCampaigns === 0
          ? `no ${labels.campaign.one.toLowerCase()} is collecting`
          : 'collecting right now',
    },
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
      // Two different nothings, and the difference matters to whoever is reading it: no
      // measurable audience at all, versus an audience that simply was not being asked
      // during the range they picked. The second is fixed by changing the range.
      context:
        view.stats.window === 'all'
          ? `no ${labels.campaign.one.toLowerCase()} here has a fixed audience to measure against`
          : `no ${labels.campaign.one.toLowerCase()} with a fixed audience was collecting then`,
    };
  }
  // Above the roll the percentage is true and unreadable, for the reason the results card
  // spells out (N-069): a public link is answered by whoever holds it, and the denominator
  // counts only the people asked. Same number, and the context says what it means.
  if (view.stats.responseRate > 1) {
    return {
      kicker: 'Response rate',
      value: `${Math.round(view.stats.responseRate * 100)}%`,
      context: `more answers than people asked — links can be answered by anyone holding them, ${RANGE_PHRASE[view.stats.window]}`,
    };
  }
  return {
    kicker: 'Response rate',
    value: `${Math.round(view.stats.responseRate * 100)}%`,
    context: `of the people asked, ${RANGE_PHRASE[view.stats.window]}`,
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
