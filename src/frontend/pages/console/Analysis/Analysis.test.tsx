// T-082 — /app/analysis. 43 § Acceptance (the page half).
//
// MOCKS `lib/api.js`, not `lib/analysis.js`. The interesting logic on this screen is in the
// hook — which failure is an error and which two are not — and mocking the hook away would
// leave these asserting that a card renders, which was never the risk.
//
// THE THREE ASSERTIONS THIS FILE EXISTS FOR:
//
//   1. 402 AND 403 ARE DIFFERENT SCREENS (DEC-011). A Bronze customer with every permission
//      in the product must never be told their account cannot open this, and somebody
//      without the capability must never be invited to buy something they still could not
//      use. `43` names this page as the place that split is worth demonstrating.
//   2. NEGATIVE SENTIMENT IS NEVER THE BRAND ACCENT (CONF-004) — an acceptance criterion
//      written as a colour rule, asserted here as a class rule, which is the only part of
//      it a test can see.
//   3. THE DRILL-THROUGH CARRIES ITS OWN GATE. Its 403 is `response.read`, and it renders
//      INSIDE the panel with the analysis still on screen, exactly as `40` keeps its
//      aggregates when the comments are refused.
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

/* ------------------------------------------------- 402 is not 403 (DEC-011) */

describe('the two failures that are not errors', () => {
  it('renders an UPGRADE CARD on 402, naming the tier the server named', async () => {
    overview = throws(402, 'That feature is not included in your plan.', {
      requiredTier: 'silver',
      currentTier: 'bronze',
    });
    mount();

    expect(await screen.findByText(/Silver — Understand/)).toBeTruthy();
    // What it ADDS, in the customer's words, from PLAN_OPTIONS rather than invented here.
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
    // THE POINT OF DEC-011, as a test. A Bronze customer with every permission in the
    // product being told to ask their administrator would send them to fix a permission
    // that was never wrong.
    expect(screen.queryByText(/do not have access/i)).toBeNull();
    // Not an error page either (43 § States): no alert, nothing red.
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
    // A request nobody may answer is a request not worth making. The 403 would be handled
    // anyway; this is about not making it.
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

/* ------------------------------------------------------------ the k-anon gate */

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
    // THE PROPERTY THAT MATTERS (52 §2, INV-007). The suppressed body has no `themes` key
    // at all — not an empty array — so this is asserting that the page reads the absence
    // rather than that it hides a value it was given.
    overview = { suppressed: true, threshold: 5, reliability: {
      responseCount: 3, audienceEstimate: null, responseRate: null, confidence: 'low' } };
    mount();

    await screen.findByText(/Not enough responses yet/);
    expect(screen.queryByText('Themes')).toBeNull();
    expect(screen.queryByText('Parking')).toBeNull();
    expect(screen.queryByText('Key drivers')).toBeNull();
  });

  it('an empty organisation gets the empty state, not the suppression card', async () => {
    // Different facts, different screens: "nobody has answered" is not "we are protecting
    // three people". Only the second one is a promise being kept.
    overview = { suppressed: true, threshold: 5, reliability: {
      responseCount: 0, audienceEstimate: null, responseRate: null, confidence: 'low' } };
    mount();

    expect(await screen.findByText(/Nothing to analyse yet/)).toBeTruthy();
    expect(screen.queryByText(/Not enough responses yet/)).toBeNull();
  });
});

/* --------------------------------------------------------------- reliability */

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
    // N-044, the same lesson `40` learned at T-040: a response rate whose halves are
    // measured differently is not a low rate, it is a wrong one. An open audience has no
    // denominator, so the honest render is a sentence and not a percentage.
    overview = view({ reliability: {
      responseCount: 42, audienceEstimate: null, responseRate: null, confidence: 'medium' } });
    mount();

    await screen.findByText('Themes');
    expect(screen.getAllByText(/Medium confidence/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no fixed list to compare against/).length).toBeGreaterThan(0);
    expect(document.querySelector('.reliability-strip')?.textContent).not.toContain('0%');
  });

  it('rides along with EVERY headline number, not just the strip', async () => {
    // `43` § Acceptance: "Reliability is SHOWN alongside every headline number". The strip
    // scrolls away; a screenshot of the themes table does not carry it. Every panel heading
    // gets the tag, so a number quoted off this page cannot lose it.
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
    // `tag-warn`, not `tag-bad`. What is thin is the evidence, not the feedback, and
    // painting it the same red as negative sentiment would say the opposite.
    expect(screen.getAllByText(/Low confidence/)[0]?.className).toContain('tag-warn');
  });
});

/* ------------------------------------------------------------------ CONF-004 */

describe('colour never carries the meaning, and never carries the brand', () => {
  it('negative sentiment is the status ramp and NEVER the accent', async () => {
    mount();
    await screen.findByText('Sentiment');

    // The acceptance criterion, as the only thing a test can see of it: no element on the
    // page paints a negative reading with an accent class. Blue is the product and cannot
    // also mean somebody is unhappy (design_specs/design/08 § corrections).
    for (const node of document.querySelectorAll('.fill-bad, .stroke-bad, .tag-bad')) {
      expect(node.className).not.toContain('accent');
    }
    expect(document.querySelectorAll('.fill-accent, .stroke-accent').length).toBe(0);
  });

  it('every valence indicator carries a word beside the colour', async () => {
    mount();
    await screen.findByText('Themes');
    // 21 §8. A greyscale reader, a projector and about one man in twelve all need this.
    expect(screen.getAllByText('Negative').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Positive').length).toBeGreaterThan(0);
  });

  it('draws a delta with NO valence — more mentions is not thereby better or worse', async () => {
    mount();
    await screen.findByRole('button', { name: 'Parking' });
    const chip = document.querySelector('.trend-chip');
    // No `tag-good`/`tag-bad`: the payload states a valence for the SCORE and states none
    // for the delta, and the chip is built so the honest thing is the default one.
    expect(chip?.className).not.toContain('tag-');
    expect(chip?.className).toContain('is-down');
  });

  it('renders a NULL delta as absent, never as a zero', async () => {
    // DEC-061. `delta` is measured against the window immediately before this one, and with
    // no date range there is no such window. A "0" would be a claim that nothing changed.
    mount();
    await screen.findByRole('button', { name: 'Staff' });
    const chips = document.querySelectorAll('.trend-chip');
    expect(chips.length).toBe(1);
    expect(screen.queryByText(/no change/)).toBeNull();
  });
});

/* --------------------------------------------------------- the drill-through */

describe('a theme drills through to its source comments', () => {
  it('opens one, and asks the theme route for it', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Parking' }));

    expect(await screen.findByText(/Parking was full every single morning/)).toBeTruthy();
    expect(paths.some((p) => p.startsWith('/analysis/themes/parking'))).toBe(true);
  });

  it('reads the open theme FROM THE URL, so a finding is a link somebody can send', async () => {
    // Mounted straight at the address, with nothing clicked. If the panel opens, the state
    // lives in the query string rather than in a `useState` — which is what makes "look at
    // this theme" something you can paste into a message (the same rule as 40's filters).
    mount(ALL, '/app/analysis?theme=parking');

    expect(await screen.findByText(/Parking was full every single morning/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Parking' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('a 403 HERE is response.read, and the analysis stays on screen behind it', async () => {
    // `43` § The drill-through. Somebody who can read this page and not this panel is not a
    // bug — they are `40`'s split working, on the route that would otherwise have gone
    // around it.
    themeAnswer = throws(403, 'You may not do that.');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Parking' }));

    expect(await screen.findByText(/separate permission from seeing the numbers/)).toBeTruthy();
    // Still there. The aggregates are not withdrawn because the comments were.
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
    // The one table in the product whose point is that you can open a row. A `<tr>` with an
    // onClick is not focusable and is announced as nothing.
    mount();
    const opener = await screen.findByRole('button', { name: 'Parking' });
    expect(opener.tagName).toBe('BUTTON');
  });
});

/* --------------------------------------------------------------- the filters */

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

/* ----------------------------------------------------------------- INV-001 */

describe('no domain noun is hardcoded', () => {
  it('the filter labels come from the vocabulary', async () => {
    // NONSENSE_LABELS renames `campaign` to "Plithe", `subject` to "Quaxel", `unit` to
    // "Zblorn". If the page renders an English noun instead, it hardcoded one.
    mount();
    await screen.findByText('Themes');
    // `getAll`, because <PageHeader> renders <VocabularyChips> too — the same three words
    // arrive twice on this page, from the same one source, which is the invariant working
    // rather than an accident.
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

/* ------------------------------------------------------------ what it is not */

describe('what this page deliberately does not do', () => {
  it('DOES NOT POLL, unlike results', () => {
    // `40` polls because the demo beat is a number moving while somebody watches. This is a
    // corpus-wide recomputation on every call and does not change minute to minute (43 §
    // State); a ten-second timer would re-run the engine over every comment in the
    // organisation six times a minute for a screen nobody is watching for movement.
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
    // A primary button that navigates nowhere is what design_specs/design/02 §7 refuses in
    // the sidebar, and it would be worse here — on the one screen whose job is to make an
    // upgrade path legible.
    expect(screen.queryByRole('button', { name: /upgrade|join|choose/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /upgrade|join|choose/i })).toBeNull();
  });

  it('says so plainly when no driver clears the deadband', async () => {
    // The honest answer, and the one the seeded demo data produces: `demo.ts` draws a
    // comment's tone and its rating as independent throws, so every correlation lands
    // inside the deadband. A neutral "key driver" would present a non-finding as a finding.
    overview = view({ drivers: [
      { id: 'parking', label: 'Parking', impact: 0.03, valence: 'neutral' },
    ] });
    mount();
    expect(await screen.findByText(/No theme moves the score much here/)).toBeTruthy();
  });
});
