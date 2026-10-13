import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AnalysisView, Capability, ThemeDetail } from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders } from '../../../test-utils.js';
import Analysis from './index.js';

const hoisted = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    details: Record<string, unknown>;
    constructor(status: number, message: string, details: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }
  return { ApiError };
});

const view = (over: Partial<AnalysisView> = {}): AnalysisView => ({
  suppressed: false,
  threshold: 5,
  reliability: {
    responseCount: 120,
    audienceEstimate: 400,
    responseRate: 0.3,
    confidence: 'high',
  },
  sentiment: { positive: 61, neutral: 23, negative: 16 },
  trend: [
    { date: '2026-08-01', positive: 4, neutral: 2, negative: 1 },
    { date: '2026-08-02', positive: 6, neutral: 1, negative: 3 },
  ],
  themes: [
    { id: 'parking', label: 'Parking', mentions: 40, score: 22, valence: 'negative', delta: -6 },
    { id: 'staff', label: 'Staff', mentions: 31, score: 81, valence: 'positive', delta: null },
  ],
  drivers: [
    { id: 'parking', label: 'Parking', impact: -0.42, valence: 'negative' },
    { id: 'staff', label: 'Staff', impact: 0.36, valence: 'positive' },
  ],
  commentCount: 100,
  ...over,
});

const detail = (over: Partial<ThemeDetail> = {}): ThemeDetail => ({
  id: 'parking',
  label: 'Parking',
  mentions: 40,
  score: 22,
  valence: 'negative',
  delta: -6,
  comments: [
    {
      responseId: 'r-1',
      questionId: 'q-1',
      at: '2026-08-02T09:00:00.000Z',
      campaign: { id: 'c-1', name: 'Autumn round' },
      subject: { id: 's-1', name: 'North wing' },
      questionText: 'Anything else you would like to tell us?',
      comment: 'Parking was full every single morning',
      score: 2,
      scoreMax: 5,
      valence: 'negative',
    },
  ],
  ...over,
});

let overview: AnalysisView | (() => never);
let themeAnswer: ThemeDetail | (() => never);
let paths: string[];

const apiGet = vi.fn((path: string) => {
  paths.push(path);
  if (path.startsWith('/analysis/themes/')) {
    if (typeof themeAnswer === 'function') return themeAnswer();
    return { data: themeAnswer };
  }
  if (path.startsWith('/analysis')) {
    if (typeof overview === 'function') return overview();
    return { data: overview };
  }
  if (path.startsWith('/campaigns')) {
    return { data: [{ id: 'c-1', name: 'Autumn round' }], page: {}, meta: { total: 1 } };
  }
  if (path.startsWith('/subjects')) {
    return { data: [{ id: 's-1', name: 'North wing' }], page: {}, meta: { total: 1 } };
  }
  if (path.startsWith('/units')) return { data: [] };
  throw new Error(`unmocked GET ${path}`);
});

vi.mock('../../../lib/api.js', () => ({
  apiGet: (p: string) => apiGet(p),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: hoisted.ApiError,
}));

const ALL: Capability[] = ['analysis.read', 'response.read', 'campaign.read', 'subject.read', 'unit.read'];

const mount = (capabilities: Capability[] = ALL, path = '/app/analysis') =>
  renderWithProviders(<Analysis />, { capabilities, path, labels: NONSENSE_LABELS });

const throws = (status: number, message: string, details?: Record<string, unknown>) => () => {
  throw new hoisted.ApiError(status, message, details);
};

beforeEach(() => {
  vi.clearAllMocks();
  overview = view();
  themeAnswer = detail();
  paths = [];
});

describe('the two failures that are not errors', () => {
  it('renders an UPGRADE CARD on 402, naming the tier the server named', async () => {
    overview = throws(402, 'That feature is not included in your plan.', {
      requiredTier: 'silver',
      currentTier: 'bronze',
    });
    mount();

    expect(await screen.findByText(/Silver — Understand/)).toBeTruthy();
    expect(screen.getByText(/Themes, sentiment, trends, reliability/)).toBeTruthy();
    expect(screen.getByText(/You are on Bronze — Measure/)).toBeTruthy();
  });

  it('and the 402 never says the account has no access — that is the OTHER failure', async () => {
    overview = throws(402, 'That feature is not included in your plan.', {
      requiredTier: 'silver',
      currentTier: 'bronze',
    });
    mount();

    await screen.findByText(/Silver — Understand/);
    expect(screen.queryByText(/do not have access/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the ACCESS screen on 403, and never mentions a plan', async () => {
    overview = throws(403, 'You may not do that.');
    mount();

    expect(await screen.findByText(/do not have access/i)).toBeTruthy();
    expect(screen.queryByText(/Silver/)).toBeNull();
    expect(screen.queryByText(/plan/i)).toBeNull();
  });

  it('does not ask at all without the capability', async () => {
    mount(['campaign.read']);
    await screen.findByText(/do not have access/i);
    expect(paths.filter((p) => p.startsWith('/analysis'))).toEqual([]);
  });

  it('an ordinary failure IS an error, and says so', async () => {
    overview = throws(500, 'The server fell over.');
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The server fell over.');
    expect(screen.queryByText(/Silver/)).toBeNull();
  });
});

describe('suppression', () => {
  it('renders the suppression card and NOT an error', async () => {
    overview = { suppressed: true, threshold: 5, reliability: {
      responseCount: 3, audienceEstimate: null, responseRate: null, confidence: 'low' } };
    mount();

    expect(await screen.findByText(/Not enough responses yet/)).toBeTruthy();
    expect(screen.getByText(/3 so far/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has nothing that could render a theme, because the body carried none', async () => {
    overview = { suppressed: true, threshold: 5, reliability: {
      responseCount: 3, audienceEstimate: null, responseRate: null, confidence: 'low' } };
    mount();

    await screen.findByText(/Not enough responses yet/);
    expect(screen.queryByText('Themes')).toBeNull();
    expect(screen.queryByText('Parking')).toBeNull();
    expect(screen.queryByText('Key drivers')).toBeNull();
  });

  it('an empty organisation gets the empty state, not the suppression card', async () => {
    overview = { suppressed: true, threshold: 5, reliability: {
      responseCount: 0, audienceEstimate: null, responseRate: null, confidence: 'low' } };
    mount();

    expect(await screen.findByText(/Nothing to analyse yet/)).toBeTruthy();
    expect(screen.queryByText(/Not enough responses yet/)).toBeNull();
  });
});

describe('reliability', () => {
  it('is on the page before any number is, with the denominator and the rate', async () => {
    mount();
    await screen.findByText('Themes');
    expect(screen.getAllByText(/High confidence/).length).toBeGreaterThan(0);
    const strip = document.querySelector('.reliability-strip');
    expect(strip?.textContent).toContain('120');
    expect(strip?.textContent).toContain('400');
    expect(strip?.textContent).toContain('30%');
  });

  it('says there is NO RATE rather than showing a zero, when there is no denominator', async () => {
    overview = view({ reliability: {
      responseCount: 42, audienceEstimate: null, responseRate: null, confidence: 'medium' } });
    mount();

    await screen.findByText('Themes');
    expect(screen.getAllByText(/Medium confidence/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no fixed list to compare against/).length).toBeGreaterThan(0);
    expect(document.querySelector('.reliability-strip')?.textContent).not.toContain('0%');
  });

  it('rides along with EVERY headline number, not just the strip', async () => {
    mount();
    await screen.findByText('Themes');
    const tags = screen.getAllByText(/High confidence/);
    expect(tags.length).toBeGreaterThanOrEqual(4);
  });

  it('a thin response rate is a CAUTION about the reading, not a bad result', async () => {
    overview = view({ reliability: {
      responseCount: 40, audienceEstimate: 1000, responseRate: 0.04, confidence: 'low' } });
    mount();

    await screen.findByText('Themes');
    expect(screen.getByText(/people who felt strongly answered/)).toBeTruthy();
    expect(screen.getAllByText(/Low confidence/)[0]?.className).toContain('tag-warn');
  });
});

describe('colour never carries the meaning, and never carries the brand', () => {
  it('negative sentiment is the status ramp and NEVER the accent', async () => {
    mount();
    await screen.findByText('Sentiment');

    for (const node of document.querySelectorAll('.fill-bad, .stroke-bad, .tag-bad')) {
      expect(node.className).not.toContain('accent');
    }
    expect(document.querySelectorAll('.fill-accent, .stroke-accent').length).toBe(0);
  });

  it('every valence indicator carries a word beside the colour', async () => {
    mount();
    await screen.findByText('Themes');
    expect(screen.getAllByText('Negative').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Positive').length).toBeGreaterThan(0);
  });

  it('draws a delta with NO valence — more mentions is not thereby better or worse', async () => {
    mount();
    await screen.findByRole('button', { name: 'Parking' });
    const chip = document.querySelector('.trend-chip');
    expect(chip?.className).not.toContain('tag-');
    expect(chip?.className).toContain('is-down');
  });

  it('renders a NULL delta as absent, never as a zero', async () => {
    mount();
    await screen.findByRole('button', { name: 'Staff' });
    const chips = document.querySelectorAll('.trend-chip');
    expect(chips.length).toBe(1);
    expect(screen.queryByText(/no change/)).toBeNull();
  });
});

describe('a theme drills through to its source comments', () => {
  it('opens one, and asks the theme route for it', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Parking' }));

    expect(await screen.findByText(/Parking was full every single morning/)).toBeTruthy();
    expect(paths.some((p) => p.startsWith('/analysis/themes/parking'))).toBe(true);
  });

  it('reads the open theme FROM THE URL, so a finding is a link somebody can send', async () => {
    mount(ALL, '/app/analysis?theme=parking');

    expect(await screen.findByText(/Parking was full every single morning/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Parking' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('a 403 HERE is response.read, and the analysis stays on screen behind it', async () => {
    themeAnswer = throws(403, 'You may not do that.');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Parking' }));

    expect(await screen.findByText(/separate permission from seeing the numbers/)).toBeTruthy();
    expect(screen.getByText('Themes')).toBeTruthy();
    expect(screen.getAllByText(/High confidence/).length).toBeGreaterThan(0);
  });

  it('closes again, and fetches nothing while closed', async () => {
    mount();
    await screen.findByRole('button', { name: 'Parking' });
    expect(paths.some((p) => p.startsWith('/analysis/themes/'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Parking' }));
    await screen.findByText(/Parking was full every single morning/);
    fireEvent.click(screen.getByRole('button', { name: 'Parking' }));
    await waitFor(() =>
      expect(screen.queryByText(/Parking was full every single morning/)).toBeNull(),
    );
  });

  it('is a BUTTON, not a clickable row', async () => {
    mount();
    const opener = await screen.findByRole('button', { name: 'Parking' });
    expect(opener.tagName).toBe('BUTTON');
  });
});

describe('filters', () => {
  it('go into the query string the server reads', async () => {
    mount(ALL, '/app/analysis?campaignId=c-1&from=2026-08-01&to=2026-08-31');
    await screen.findByText('Themes');
    const asked = paths.find((p) => p.startsWith('/analysis?'));
    expect(asked).toContain('campaignId=c-1');
    expect(asked).toContain('from=2026-08-01');
    expect(asked).toContain('to=2026-08-31');
  });

  it('changing one closes an open theme rather than asking for it in a window it may not be in', async () => {
    mount(ALL, '/app/analysis?theme=parking');
    await screen.findByText(/Parking was full every single morning/);

    fireEvent.change(screen.getAllByDisplayValue('All')[0] as HTMLSelectElement, {
      target: { value: 'c-1' },
    });
    await waitFor(() =>
      expect(screen.queryByText(/Parking was full every single morning/)).toBeNull(),
    );
  });
});

describe('no domain noun is hardcoded', () => {
  it('the filter labels come from the vocabulary', async () => {
    mount();
    await screen.findByText('Themes');
    expect(screen.getAllByText('Plithe').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quaxel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Zblorn').length).toBeGreaterThan(0);
  });

  it('and so does the empty state', async () => {
    overview = { suppressed: true, threshold: 5, reliability: {
      responseCount: 0, audienceEstimate: null, responseRate: null, confidence: 'low' } };
    mount();
    expect(await screen.findByText(/plithe has collected written answers/i)).toBeTruthy();
  });

  it('and the drill-through, which is handed the words rather than reaching for them', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Parking' }));
    await screen.findByText(/Parking was full every single morning/);
    const meta = document.querySelector('.analysis-comment-meta');
    expect(meta?.textContent).toContain('Plithe: Autumn round');
    expect(meta?.textContent).toContain('Quaxel: North wing');
  });
});

describe('what this page deliberately does not do', () => {
  it('DOES NOT POLL, unlike results', () => {
    vi.useFakeTimers();
    try {
      mount();
      const before = paths.filter((p) => p.startsWith('/analysis')).length;
      vi.advanceTimersByTime(60_000);
      expect(paths.filter((p) => p.startsWith('/analysis')).length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers no upgrade BUTTON, because the plan page is not built (T-058)', async () => {
    overview = throws(402, 'nope', { requiredTier: 'silver', currentTier: 'bronze' });
    mount();
    await screen.findByText(/Silver — Understand/);
    expect(screen.queryByRole('button', { name: /upgrade|join|choose/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /upgrade|join|choose/i })).toBeNull();
  });

  it('says so plainly when no driver clears the deadband', async () => {
    overview = view({ drivers: [
      { id: 'parking', label: 'Parking', impact: 0.03, valence: 'neutral' },
    ] });
    mount();
    expect(await screen.findByText(/No theme moves the score much here/)).toBeTruthy();
  });
});
