// T-038 — the sentences. 38 § Interactions, 24 §6.
//
// Three pure functions, tested as modules for the reason the unit-delete sentence
// established: the copy rules here are acceptance criteria, and a sentence assembled inside
// a component cannot be checked without rendering one. The summary is the last thing anybody
// reads before an IRREVERSIBLE action, which makes it the highest-value string on the page.
import { describe, expect, it } from 'vitest';
import type { CampaignSummary } from '@endur/shared';
import { summarise, type SummaryInput } from './summary.js';
import { closeConsequence } from './summary-close.js';
import { timing } from './index.js';
import { autoName } from './New.js';

const WORD = { one: 'Quaxel', many: 'Quaxels' };

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  name: 'Spring check',
  templateName: 'Mid-term form',
  questionCount: 8,
  estimatedSeconds: 110,
  subjectCount: 12,
  subjectWord: WORD,
  startsAt: null,
  endsAt: null,
  anonymous: true,
  ...over,
});

describe('summarise — everything restated before the irreversible action', () => {
  it('carries the form, the cost and the count in one line', () => {
    const summary = summarise(input());
    expect(summary.name).toBe('Spring check');
    expect(summary.detail).toBe('Mid-term form · 8 questions · ~110 sec · 12 Quaxels');
  });

  it('uses the vocabulary\'s own plural rather than adding an s (INV-001)', () => {
    const summary = summarise(input({ subjectCount: 1, subjectWord: { one: 'Faculty', many: 'Faculty' } }));
    expect(summary.detail).toContain('1 Faculty');
  });

  it('does not claim a form that has not been chosen', () => {
    const summary = summarise(input({ templateName: '', questionCount: 0, estimatedSeconds: 0 }));
    expect(summary.detail).toContain('No form chosen');
    // And no "0 questions · ~0 sec" trailing off it.
    expect(summary.detail).not.toMatch(/0 questions/);
  });

  it('names the campaign Untitled rather than rendering an empty line', () => {
    expect(summarise(input({ name: '   ' })).name).toBe('Untitled');
  });
});

describe('the window says what an ABSENT date means', () => {
  it('spells out both defaults when neither is set', () => {
    // Status is derived from exactly these two dates (DEC-016), so this sentence is also a
    // plain-English description of what the derivation will do.
    expect(summarise(input()).window).toBe(
      'Opens as soon as you launch, runs until you close it · anonymous',
    );
  });

  it('explains an open-ended run', () => {
    expect(summarise(input({ startsAt: '2026-09-01T09:00:00.000Z' })).window)
      .toMatch(/^Opens .*, runs until you close it · anonymous$/);
  });

  it('explains an immediate start', () => {
    expect(summarise(input({ endsAt: '2026-09-26T23:59:00.000Z' })).window)
      .toMatch(/^Opens as soon as you launch, closes .* · anonymous$/);
  });

  it('joins both with an arrow when both are set', () => {
    expect(summarise(input({ startsAt: '2026-09-01T09:00:00.000Z', endsAt: '2026-09-26T23:59:00.000Z' })).window)
      .toContain('→');
  });

  it('says NOT anonymous out loud rather than staying silent', () => {
    // Silence would read as "anonymous" to somebody who has seen the default.
    expect(summarise(input({ anonymous: false })).window).toContain('not anonymous');
  });
});

describe('closeConsequence — the real number, and what is KEPT', () => {
  it('states the count and that results survive', () => {
    expect(closeConsequence(612)).toBe(
      '612 responses have come in. Closing stops new ones — the results stay.',
    );
  });

  it('agrees the verb with one response', () => {
    expect(closeConsequence(1)).toBe(
      '1 response has come in. Closing stops new ones — the results stay.',
    );
  });

  it('does not report zero as a count', () => {
    // "0 responses collected" reads as a failure report rather than as a fact.
    expect(closeConsequence(0)).toMatch(/Nothing has come in yet/);
  });

  it('never asks whether the reader is sure', () => {
    for (const count of [0, 1, 612]) {
      expect(closeConsequence(count)).not.toMatch(/are you sure/i);
    }
  });
});

describe('timing — the line that makes a card feel live', () => {
  const campaign = (over: Partial<CampaignSummary>): CampaignSummary => ({
    id: 'c1', name: 'x', status: 'open', templateId: 't1', templateName: 'f',
    subjectCount: 1, responseCount: 0, anonymous: true,
    startsAt: null, endsAt: null, closedAt: null, publicToken: null, url: null,
    createdAt: '2026-01-01T00:00:00.000Z', ...over,
  });
  const now = Date.parse('2026-08-20T12:00:00.000Z');

  it('counts down to the close date', () => {
    expect(timing(campaign({ endsAt: '2026-08-26T12:00:00.000Z' }), now)).toBe('ends in 6 days');
  });

  it('says today rather than "in 0 days"', () => {
    expect(timing(campaign({ endsAt: '2026-08-20T18:00:00.000Z' }), now)).toBe('ends today');
  });

  it('counts up to the start date when scheduled', () => {
    expect(timing(campaign({ status: 'scheduled', startsAt: '2026-09-01T09:00:00.000Z' }), now))
      .toMatch(/^starts /);
  });

  it('reports a closed campaign by when it closed', () => {
    expect(timing(campaign({ status: 'closed', closedAt: '2026-08-18T00:00:00.000Z' }), now))
      .toMatch(/^closed /);
  });

  it('says nothing for a draft, which has no dates that mean anything yet', () => {
    expect(timing(campaign({ status: 'draft' }), now)).toBeNull();
  });
});

describe('autoName — one less typing beat in the live demo', () => {
  it('is the form name and the month', () => {
    expect(autoName('Mid-term form', new Date('2026-08-20T00:00:00.000Z'))).toMatch(
      /^Mid-term form — \w+ 2026$/,
    );
  });
});
