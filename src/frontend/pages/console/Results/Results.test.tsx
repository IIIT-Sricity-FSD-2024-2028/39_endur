// T-040 — /app/campaigns/:id/results. 40, design_specs/design/08 §8.1.
//
// The assertions that carry the most weight are about what this page REFUSES to do:
// suppress below the threshold without rendering a workaround, colour a distribution, and
// show comments to somebody who may see only aggregates.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, CampaignDetail, Page, ResponseItem, ResultsView, UnitNode } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import { ApiError } from '../../../lib/api.js';
import Results from './index.js';

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined), toDataURL: vi.fn().mockResolvedValue('data:,') },
}));

const DETAIL: CampaignDetail = {
  id: 'c1', name: 'Spring check', status: 'open',
  templateId: 't1', templateName: 'Mid-term form',
  subjectCount: 2, responseCount: 612, anonymous: true, access: 'public',
  startsAt: '2026-08-11T09:00:00.000Z', endsAt: '2026-08-26T23:59:00.000Z', closedAt: null,
  publicToken: 'K4M9X2PQ', url: 'https://feedback.example.test/r/K4M9X2PQ',
  createdAt: '2026-08-01T00:00:00.000Z',
  audience: { kind: 'anyone' },
  subjects: [
    { id: 's1', name: 'Data Structures', unitName: 'Engineering' },
    { id: 's2', name: 'Thermodynamics', unitName: 'Engineering' },
  ],
};

const VIEW: ResultsView = {
  responseCount: 612,
  audienceEstimate: null,
  responseRate: null,
  suppressed: false,
  threshold: 5,
  questions: [
    {
      questionId: 'q1', kind: 'rating', text: 'How clear were the explanations?', answered: 612,
      average: 4.3,
      distribution: [
        { label: '1', count: 26, percent: 4.2 },
        { label: '2', count: 49, percent: 8 },
        { label: '3', count: 98, percent: 16 },
        { label: '4', count: 198, percent: 32.4 },
        { label: '5', count: 241, percent: 39.4 },
      ],
    },
    {
      questionId: 'q2', kind: 'nps', text: 'Would you recommend it?', answered: 500,
      npsMix: { promoters: 300, passives: 100, detractors: 100, score: 40 },
      distribution: [
        { label: 'Promoters', count: 300, percent: 60, valence: 'positive' },
        { label: 'Passives', count: 100, percent: 20, valence: 'neutral' },
        { label: 'Detractors', count: 100, percent: 20, valence: 'negative' },
      ],
    },
    { questionId: 'q3', kind: 'text', text: 'What should change?', answered: 287 },
  ],
};

const RESPONSES: Page<ResponseItem> = {
  data: [
    {
      id: 'r1', submittedAt: '2026-08-20T10:00:00.000Z', subjectName: 'Data Structures',
      answers: [{ questionId: 'q3', questionText: 'What should change?', text: 'More worked examples.' }],
    },
    {
      id: 'r2', submittedAt: '2026-08-20T09:00:00.000Z', subjectName: 'Thermodynamics',
      answers: [{ questionId: 'q3', questionText: 'What should change?', text: 'The pace picks up too much.' }],
    },
    {
      id: 'r3', submittedAt: '2026-08-20T08:00:00.000Z', subjectName: null,
      answers: [{ questionId: 'q3', questionText: 'What should change?', text: 'Nothing, it was good.' }],
    },
    {
      id: 'r4', submittedAt: '2026-08-20T07:00:00.000Z', subjectName: 'Data Structures',
      answers: [{ questionId: 'q3', questionText: 'What should change?', text: 'More labs.' }],
    },
  ],
  page: { nextCursor: null, hasMore: false },
  meta: { total: 287 },
};

const UNITS: UnitNode[] = [{
  id: 'u1', name: 'Engineering', parentId: null, isTemporary: false, endsAt: null,
  peopleCount: 40, subjectCount: 2, children: [],
}];

const reload = vi.fn();
const loadMore = vi.fn();
const fetchExport = vi.fn();
const saveCsv = vi.fn();
let results: { data: ResultsView | null; loading: boolean; error: Error | null; arrived: number; refreshing: boolean };
let responses: { data: Page<ResponseItem> | null; loading: boolean; error: Error | null; suppressed: boolean; forbidden: boolean };

vi.mock('../../../lib/results.js', () => ({
  POLL_MS: 10_000,
  resultsSearch: () => '',
  useResults: () => ({ ...results, reload }),
  useResponses: (_id: string, enabled: boolean) =>
    enabled
      ? { ...responses, loadMore }
      : { data: null, loading: false, error: null, suppressed: false, forbidden: true, loadMore },
  fetchExport: (...args: unknown[]) => fetchExport(...args) as unknown,
  saveCsv: (...args: unknown[]) => saveCsv(...args) as unknown,
}));
vi.mock('../../../lib/campaigns.js', () => ({
  useCampaign: () => ({ data: DETAIL, loading: false, error: null }),
  launchKey: (id: string) => id,
  campaignSearch: () => '',
  useCampaignList: () => ({ data: null, loading: false, error: null }),
  useAudiencePreview: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({ data: UNITS, loading: false, error: null }),
}));

const ALL: Capability[] = ['results.read', 'response.read', 'results.export', 'campaign.read'];

const mount = (capabilities: Capability[] = ALL, path = '/app/campaigns/c1/results') =>
  renderWithProviders(
    <Routes>
      <Route path="/app/campaigns/:id/results" element={<Results />} />
      <Route path="/app/campaigns" element={<p>LIST</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path },
  );

beforeEach(() => {
  vi.clearAllMocks();
  results = { data: VIEW, loading: false, error: null, arrived: 0, refreshing: false };
  responses = { data: RESPONSES, loading: false, error: null, suppressed: false, forbidden: false };
  fetchExport.mockResolvedValue({ filename: 'x.csv', csv: 'a,b\n1,2\n' });
});

describe('the four stat cards', () => {
  it('shows the counts, and a dash where there is no denominator', () => {
    const { container } = mount();
    // Scoped to the stat row: 4.3 is also q1's average further down the page, and a query
    // that matches both is a query that would keep passing if one of them vanished.
    const cards = within(container.querySelector('.stat-row') as HTMLElement);
    expect(cards.getByText('612')).toBeTruthy();
    expect(cards.getByText('4.3')).toBeTruthy();
    expect(cards.getByText('287')).toBeTruthy();
    // The server sent responses ÷ subjects here until T-040 — 5100% on this fixture.
    expect(screen.getByText(/no total to measure against/)).toBeTruthy();
  });

  it('announces the count to a screen reader without shouting the whole card', () => {
    const { container } = mount();
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('612 responses');
  });

  it('offers a manual refresh beside the count, because the poll is the flaky part', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the numbers on screen when a poll fails, and says they are stale', () => {
    results = { ...results, error: new Error('offline') };
    mount();
    // A page somebody is presenting from must not blank (40 § States).
    expect(screen.getByText('612')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/last successful check/);
  });
});

describe('per-question cards state what happened and do not judge it', () => {
  it('numbers each question and names its type', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Q1 · How clear were the explanations?' })).toBeTruthy();
    // From the distribution's own length — the results DTO carries no config.
    expect(screen.getByText(/Rating 1–5 · 612 answers/)).toBeTruthy();
  });

  it('draws every rating bar in ONE colour', () => {
    const { container } = mount();
    // 40: "do not colour rating 1 red and rating 5 green — that is interpretation". The
    // page has no branch that could; this is the test that keeps it that way.
    const q1 = container.querySelectorAll('.qr-card')[0] as HTMLElement;
    const fills = [...q1.querySelectorAll('.bar-fill')];
    expect(fills).toHaveLength(5);
    expect(fills.every((fill) => fill.classList.contains('fill-accent'))).toBe(true);
    expect(q1.querySelector('.fill-bad')).toBeNull();
    expect(q1.querySelector('.fill-good')).toBeNull();
  });

  it('uses three colours for NPS, where they are the instrument\'s own words', () => {
    const { container } = mount();
    const q2 = container.querySelectorAll('.qr-card')[1] as HTMLElement;
    // The one exception, and it is an exception because a 0–6 IS a detractor by definition
    // rather than by inference (CONF-004).
    expect(q2.querySelector('.stacked-track')).toBeTruthy();
    expect(within(q2).getByText('Detractors')).toBeTruthy();
    expect(within(q2).getByText('+40')).toBeTruthy();
  });

  it('shows the average as a number, with no badge and no threshold colour', () => {
    const { container } = mount();
    // <ScoreBadge> is catalogued in 24 and deliberately not built — CONF-016.
    expect(container.querySelector('.qr-average')?.textContent).toMatch(/^4\.3/);
    expect(container.querySelector('.score-badge')).toBeNull();
  });

  it('sends the free-text question to the comments rather than inventing a chart', () => {
    mount();
    expect(screen.getByText(/Free text · 287 of 612 answered/)).toBeTruthy();
    expect(screen.getByText(/in the comments below/)).toBeTruthy();
  });
});

describe('comments are a different level of access', () => {
  it('shows three, then offers the rest in place', () => {
    mount();
    expect(screen.getByText('More worked examples.')).toBeTruthy();
    expect(screen.queryByText('More labs.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show all 287 comments/ }));
    expect(screen.getByText('More labs.')).toBeTruthy();
  });

  it('is ABSENT without response.read — not greyed, and the aggregates still render', () => {
    mount(['results.read', 'campaign.read']);
    // 40 § States. Seeing that the average is 4.3 and reading what one person wrote are
    // different levels of access, and this is what that looks like on the page.
    expect(screen.queryByRole('heading', { name: 'Comments' })).toBeNull();
    expect(screen.getAllByText('4.3').length).toBeGreaterThan(0);
  });

  it('names the org\'s own noun when a comment has no subject (INV-001)', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Show all 287 comments/ }));
    expect(screen.getByText(/No quaxel/)).toBeTruthy();
  });
});

describe('the k-anonymity gate is the server\'s, and this page just explains it', () => {
  it('says how many more are needed, and does not read as an error', () => {
    results = {
      ...results,
      data: { responseCount: 3, audienceEstimate: null, responseRate: null, suppressed: true, threshold: 5 },
    };
    mount();
    expect(screen.getByText(/Results appear once 5 people have responded. 3 so far./)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders no question data at all, because it was sent none', () => {
    results = {
      ...results,
      data: { responseCount: 3, audienceEstimate: null, responseRate: null, suppressed: true, threshold: 5 },
    };
    const { container } = mount();
    // Enforced by absence in the body (52 §2) — there is nothing here that could
    // reconstruct a distribution, and that is the guarantee rather than a UI convention.
    expect(container.querySelectorAll('.qr-card')).toHaveLength(0);
    expect(container.querySelector('.stat-row')).toBeNull();
  });
});

describe('the empty and closed states', () => {
  it('offers the fix when nothing has come in', () => {
    results = { ...results, data: { ...VIEW, responseCount: 0, questions: [] } };
    mount();
    expect(screen.getByText('No responses yet')).toBeTruthy();
    // Deliberately NOT the same name as the header's Share button: two controls a query
    // cannot tell apart are two controls a screen reader cannot tell apart (N-036).
    fireEvent.click(screen.getByRole('button', { name: 'Share the link' }));
    expect(screen.getByRole('dialog', { name: /Share Spring check/ })).toBeTruthy();
  });

  it('reaches the share sheet from the header too', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByRole('dialog', { name: /Share Spring check/ })).toBeTruthy();
  });
});

describe('export', () => {
  it('downloads the CSV through the API client', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(saveCsv).toHaveBeenCalledTimes(1));
    expect(fetchExport).toHaveBeenCalledWith('c1');
    expect(saveCsv.mock.calls[0]?.[0]).toBe('Spring check-results.csv');
  });

  it('shows the plan message in place rather than navigating to raw JSON', async () => {
    fetchExport.mockRejectedValue(new ApiError({
      code: 'PAYMENT_REQUIRED', status: 402, requestId: 'r',
      message: 'That feature is not included in your plan.',
    }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    // A plain <a href> would answer a 402 by showing the reader an error envelope.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not included in your plan/));
  });

  it('is absent without the capability', () => {
    mount(['results.read', 'response.read', 'campaign.read']);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });
});

describe('filters are linkable and scope-filtered by the API', () => {
  it('reads the filter out of the URL', () => {
    mount(ALL, '/app/campaigns/c1/results?subjectId=s2');
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: /Quaxel/ }).value).toBe('s2');
  });

  it('offers only what the API returned — the dropdowns are already scoped (INV-003)', () => {
    mount();
    const subject = screen.getByRole('combobox', { name: /Quaxel/ });
    expect(within(subject).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['All', 'Data Structures', 'Thermodynamics']);
  });
});
