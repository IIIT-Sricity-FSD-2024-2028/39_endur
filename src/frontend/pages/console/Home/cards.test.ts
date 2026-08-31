// T-041 — the home stat cards and prompt copy. 46 § Interactions.
//
// Pure, so the edges are reachable. Two of them matter more than the rest: the response
// rate, which was wrong on the server until T-041 and is the second number anybody looks
// at after signing in, and the prompt copy, which is the only place on this page where a
// full sentence is assembled around a vocabulary noun.
import { describe, expect, it } from 'vitest';
import type { HomeView } from '@endur/shared';
import { NONSENSE_LABELS } from '../../../test-utils.js';
import { resolveLabels } from '@endur/shared';
import { endsIn, promptCopy, statCards } from './cards.js';

const labels = resolveLabels(NONSENSE_LABELS);

const view = (over: Partial<HomeView['stats']> = {}, rest: Partial<HomeView> = {}): HomeView => ({
  stats: {
    window: '30d',
    responses: 1057,
    subjectsCovered: 18,
    activeCampaigns: 2,
    responseRate: null,
    responsesEver: 4210,
    ...over,
  },
  prompts: [],
  configured: true,
  ...rest,
});

describe('the four cards', () => {
  it('is four of them, most-answerable first', () => {
    expect(statCards(view(), labels).map((card) => card.kicker))
      .toEqual(['Responses', 'Response rate', 'Quaxels covered', 'Active Plithes']);
  });

  it('takes its kickers from the vocabulary, not from English', () => {
    // The screen the org switcher lands on. This assertion is the ten-second proof in
    // miniature: a hospital's home says Rounds, not Campaigns (INV-001).
    const cards = statCards(view(), labels);
    expect(cards[3]?.kicker).toBe('Active Plithes');
    expect(cards[2]?.kicker).toBe('Quaxels covered');
    expect(JSON.stringify(cards)).not.toMatch(/campaign/i);
  });

  it('groups the thousands, because 1057 is read from across a room', () => {
    expect(statCards(view(), labels)[0]?.value).toBe((1057).toLocaleString());
  });
});

describe('the response rate needs a denominator that exists', () => {
  it('renders a dash AND the reason when nothing has an audience', () => {
    // This card rendered 3161% for Northfield and 4675% for Riverside until T-041 —
    // responses divided by SUBJECTS, on the first screen after sign-in (N-046).
    const rate = statCards(view({ window: 'all' }), labels)[1];
    expect(rate?.value).toBe('—');
    expect(rate?.context).toMatch(/fixed audience/);
    // And the reason names the org's own word for it, like everything else here.
    expect(rate?.context).toMatch(/plithe/);
  });

  it('blames the RANGE rather than the audience when a range is in play — DEC-031', () => {
    // Two different nothings. Inside a range, an empty rate usually means nothing was
    // collecting then, and that one is fixed by pressing "All time" — so the card says
    // which of the two it is instead of a dash that reads as a failed load.
    const rate = statCards(view({ window: '7d' }), labels)[1];
    expect(rate?.context).toMatch(/was collecting then/);
  });

  it('renders a real percentage, with the range it was measured over', () => {
    expect(statCards(view({ responseRate: 0.77 }), labels)[1]).toMatchObject({
      value: '77%',
      context: 'of the people asked, in the last 30 days',
    });
  });
});

describe('every card carries its own range — DEC-031', () => {
  it('says the period in words, not only in the control above it', () => {
    // A screen reader lands on the figure and not on the segmented control, and a
    // screenshot of this row travels without it. 412 under a bare "30 days" reads as a
    // duration; "in the last 30 days" cannot.
    expect(statCards(view({ window: 'today' }), labels)[0]?.context).toBe('since midnight');
    expect(statCards(view({ window: '7d' }), labels)[0]?.context).toBe('in the last 7 days');
    expect(statCards(view({ window: 'all' }), labels)[0]?.context).toBe('all time');
  });

  it('says nothing has come in rather than showing a bare zero', () => {
    expect(statCards(view({ window: 'today', responses: 0 }), labels)[0]?.context)
      .toBe('nothing yet today');
    expect(statCards(view({ window: '30d', responses: 0 }), labels)[0]?.context)
      .toBe('nothing in the last 30 days');
  });

  it('carries no trend arrow, whatever the range — CONF-017 still holds', () => {
    // A window makes a previous period MEASURABLE, which removes one of CONF-017's three
    // reasons and none of the other two: 46 § Out of scope rules trends off this page by
    // name, and § Purpose forbids it becoming an analysis surface. Counts, not directions.
    expect(JSON.stringify(statCards(view(), labels))).not.toMatch(/[▲▼]/);
  });

  it('leaves the active-campaign count OUT of the range, and says so', () => {
    // It is a fact about the present. "Campaigns open at some point in the last 30 days"
    // is a different number that would look identical sitting in this row.
    const active = statCards(view({ window: 'today' }), labels)[3];
    expect(active?.value).toBe('2');
    expect(active?.context).toBe('collecting right now');
  });
});

describe('the prompts', () => {
  it('asks for the org’s own noun, in a sentence', () => {
    const prompt = promptCopy({ kind: 'no_subjects', href: '/app/subjects' }, labels, 'Northfield');
    expect(prompt.title).toBe('Add a quaxel');
    expect(prompt.action).toBe('Add a Quaxel');
    expect(prompt.body).toMatch(/plithe/);
  });

  it('names the organisation when the nudge is about setup', () => {
    const prompt = promptCopy({ kind: 'setup_incomplete', href: '/app/setup' }, labels, 'Northfield');
    expect(prompt.body).toMatch(/^Northfield/);
    expect(prompt.href).toBe('/app/setup');
  });

  it('reports the seat overage without threatening anybody with it', () => {
    const prompt = promptCopy({ kind: 'seats_over', href: '/app/settings' }, labels, 'Northfield');
    // Nothing has stopped working, and the copy says so — a dashboard banner that implies
    // an outage during a demo is worse than the overage it is reporting.
    expect(prompt.body).toMatch(/Nothing has stopped working/);
  });
});

describe('when a campaign closes', () => {
  const now = Date.parse('2026-08-20T12:00:00.000Z');

  it('counts the days, and agrees with itself about one of them', () => {
    expect(endsIn('2026-08-26T12:00:00.000Z', now)).toBe('ends in 6 days');
    expect(endsIn('2026-08-21T12:00:00.000Z', now)).toBe('ends in 1 day');
  });

  it('says today rather than "in 0 days"', () => {
    expect(endsIn('2026-08-20T18:00:00.000Z', now)).toBe('ends today');
  });

  it('is silent when a campaign has no end date at all', () => {
    // An open-ended campaign is legal (38), and "ends in NaN days" is what happens to a
    // page that assumes otherwise.
    expect(endsIn(null, now)).toBeNull();
  });
});
