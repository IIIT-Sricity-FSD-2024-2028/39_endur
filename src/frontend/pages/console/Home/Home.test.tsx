// T-041 — /app. 46, design_specs/design/04 §4.1.
//
// The assertions that carry weight here are about what the page does with ABSENCE. A
// section the caller cannot read arrives as a missing KEY, not as an empty array, and this
// page is the one place in the product where telling those two apart changes what the
// reader is told: "nothing assigned to you yet" and "add your first one" are different
// sentences for different people, and only the payload knows which is which.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, HomeView } from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders } from '../../../test-utils.js';
import Home from './index.js';

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined), toDataURL: vi.fn().mockResolvedValue('data:,') },
}));

const reload = vi.fn();
let home: { data: HomeView | null; loading: boolean; error: Error | null };
/** Every range the page has asked the hook for, in order — DEC-031. */
const ranges: string[] = [];

vi.mock('../../../lib/home.js', () => ({
  useHome: (window: string) => {
    ranges.push(window);
    return { ...home, reload };
  },
}));

const FULL: HomeView = {
  stats: {
    window: '30d', responses: 1057, subjectsCovered: 18,
    activeCampaigns: 2, responseRate: null, responsesEver: 4210,
  },
  activeCampaigns: [
    {
      id: 'c1', name: 'Spring check', subjectCount: 18, responseCount: 612,
      endsAt: '2026-08-26T23:59:00.000Z',
      url: 'https://feedback.example.test/r/K4M9X2PQ', anonymous: true, access: 'public',
    },
    {
      id: 'c2', name: 'Facilities pulse', subjectCount: 1, responseCount: 210,
      endsAt: null, url: 'https://feedback.example.test/r/PQ42M9XK', anonymous: false, access: 'public',
    },
  ],
  recentComments: [
    { text: 'More worked examples.', subjectName: 'Data Structures', submittedAt: '2026-08-20T10:00:00.000Z' },
    { text: 'The pace picks up too much.', subjectName: null, submittedAt: '2026-08-20T09:00:00.000Z' },
  ],
  prompts: [],
  configured: true,
};

const ALL: Capability[] = ['org.read', 'campaign.read', 'campaign.create', 'results.read', 'response.read'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app" element={<Home />} />
      <Route path="/app/setup" element={<p>WIZARD</p>} />
      <Route path="/app/campaigns/new" element={<p>NEW CAMPAIGN</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, orgName: 'Northfield', path: '/app' },
  );

beforeEach(() => {
  vi.clearAllMocks();
  ranges.length = 0;
  home = { data: FULL, loading: false, error: null };
});

describe('the page as a whole', () => {
  it('opens with the organisation’s name and one primary action', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Northfield' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /New plithe/i })).toBeTruthy();
  });

  it('offers no way to start one without the capability to', () => {
    mount(['org.read', 'campaign.read']);
    expect(screen.queryByRole('link', { name: /New plithe/i })).toBeNull();
  });

  it('speaks the org’s vocabulary and never English', () => {
    const { container } = mount();
    expect(screen.getByText('Active Plithes')).toBeTruthy();
    expect(container.textContent).toMatch(/quaxel/i);
    expect(container.textContent).not.toMatch(/\bcampaign/i);
    expect(container.textContent).not.toMatch(/\bsubject/i);
  });

  it('sends an unconfigured org to the wizard instead of showing it an empty hub', () => {
    home = { data: { ...FULL, configured: false }, loading: false, error: null };
    mount();
    expect(screen.getByText('WIZARD')).toBeTruthy();
  });
});

describe('what the caller may not read is ABSENT — INV-003', () => {
  it('renders a coherent page, not an error, when every section is withheld', () => {
    // A junior role. Both keys are missing from the payload, which is the server saying
    // "not yours" — and the page must not look broken because of it (46 § States).
    home = {
      data: { stats: { window: '30d', responses: 0, subjectsCovered: 0, activeCampaigns: 0, responseRate: null, responsesEver: 0 }, prompts: [], configured: true },
      loading: false, error: null,
    };
    mount(['org.read']);

    expect(screen.getByText('Nothing assigned to you yet')).toBeTruthy();
    // No actions at all: offering a next step to somebody who cannot take one is worse
    // than saying nothing.
    expect(screen.queryByRole('link', { name: /add/i })).toBeNull();
    expect(screen.queryByText('Response rate')).toBeNull();
  });

  it('keeps the aggregates when only the comments are withheld', () => {
    const { recentComments, ...withoutComments } = FULL;
    void recentComments;
    home = { data: withoutComments, loading: false, error: null };
    mount(['org.read', 'campaign.read', 'results.read']);

    expect(screen.getByText('Spring check')).toBeTruthy();
    // Absent, not greyed. There is no "you don't have permission" ghost on this page.
    expect(screen.queryByText('Recent responses')).toBeNull();
  });
});

describe('a brand-new organisation', () => {
  beforeEach(() => {
    home = {
      data: {
        stats: { window: '30d', responses: 0, subjectsCovered: 0, activeCampaigns: 0, responseRate: null, responsesEver: 0 },
        activeCampaigns: [],
        recentComments: [],
        prompts: [{ kind: 'no_subjects', href: '/app/subjects' }],
        configured: true,
      },
      loading: false, error: null,
    };
  });

  it('shows a next action, NEVER four zeroes', () => {
    mount();
    // Four cards reading 0 look like a product that is broken; an empty state looks like
    // a product that is waiting for you (46 § States).
    expect(screen.queryByText('Response rate')).toBeNull();
    expect(screen.getByText('Add a quaxel')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add a Quaxel' })).toBeTruthy();
  });
});

describe('the range control — DEC-031', () => {
  it('opens on 30 days rather than all time', () => {
    mount();
    // The complaint this exists to answer: an all-time total only goes up, and nobody
    // acts on it. The first thing after sign-in is recent activity.
    expect(ranges[0]).toBe('30d');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '30 days' }).checked).toBe(true);
  });

  it('refetches rather than filtering what it already has', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
    // Server-side, and it must stay server-side: the k-anon gate and the response rate's
    // denominator are both decided there. A client slicing all-time rows would be holding
    // the rows the gate exists to withhold.
    expect(ranges.at(-1)).toBe('today');
  });

  it('keeps the previous numbers on screen while the new range loads', () => {
    home = { data: FULL, loading: true, error: null };
    const { container } = mount();
    // Not four skeletons. A range change that blanks the band makes the page jump more
    // than the data moves — the old figures dim and are replaced in place.
    expect(container.querySelectorAll('.home-skeleton')).toHaveLength(0);
    expect(screen.getByText((1057).toLocaleString())).toBeTruthy();
    expect(container.querySelector('.stat-row')?.getAttribute('aria-busy')).toBe('true');
  });

  it('is absent for a brand-new org, which has no activity to range over', () => {
    home = {
      data: {
        stats: { window: '30d', responses: 0, subjectsCovered: 0, activeCampaigns: 0, responseRate: null, responsesEver: 0 },
        activeCampaigns: [], recentComments: [],
        prompts: [{ kind: 'no_subjects', href: '/app/subjects' }],
        configured: true,
      },
      loading: false, error: null,
    };
    mount();
    expect(screen.queryByRole('radiogroup', { name: 'Range' })).toBeNull();
  });

  it('stays visible for an org that has collected before but is quiet now', () => {
    // The distinction `responsesEver` exists for: nothing arrived in 30 days, but this is
    // not a new organisation, and hiding the control would strand them on an empty band
    // with no way to widen the range.
    home = {
      data: {
        ...FULL,
        stats: { ...FULL.stats, responses: 0, subjectsCovered: 0, activeCampaigns: 0 },
        activeCampaigns: [],
        recentComments: [],
      },
      loading: false, error: null,
    };
    mount();
    expect(screen.getByRole('radiogroup', { name: 'Range' })).toBeTruthy();
    expect(screen.getByText('nothing in the last 30 days')).toBeTruthy();
  });
});

describe('the active campaigns', () => {
  it('links each one straight to its results', () => {
    mount();
    const link = screen.getByRole('link', { name: 'Spring check' });
    expect(link.getAttribute('href')).toBe('/app/campaigns/c1/results');
  });

  it('opens the QR from the payload, with no second request', () => {
    const { container } = mount();
    const card = screen.getByText('Spring check').closest('li') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Share/ }));

    // The URL travels in the home payload precisely so this click costs nothing on venue
    // wifi — during a demo the code is the most common thing anybody wants from here.
    expect(container.querySelector('.share-url')?.textContent)
      .toBe('feedback.example.test/r/K4M9X2PQ');
  });

  it('shows the count and the closing date, and NO progress bar', () => {
    const { container } = mount();
    const card = screen.getByText('Spring check').closest('li') as HTMLElement;
    expect(within(card).getByText('612')).toBeTruthy();
    expect(within(card).getByText(/ends in/)).toBeTruthy();
    // design_specs/design/04 §4.1 draws `612 / 800`. That denominator is the one T-040 and
    // T-041 both had to remove — an open link has no roll to be a fraction of (N-046).
    expect(container.querySelector('.bar-fill')).toBeNull();
  });

  it('says so plainly when nothing is collecting', () => {
    home = {
      data: { ...FULL, activeCampaigns: [], stats: { ...FULL.stats, activeCampaigns: 0 } },
      loading: false, error: null,
    };
    mount();
    expect(screen.getByText(/Nothing is collecting right now/)).toBeTruthy();
  });
});

describe('the prompts', () => {
  it('renders what the server sent and adds none of its own', () => {
    home = {
      data: {
        ...FULL,
        prompts: [
          { kind: 'no_campaigns', href: '/app/campaigns' },
          { kind: 'seats_over', href: '/app/settings' },
        ],
      },
      loading: false, error: null,
    };
    const { container } = mount();

    // Two is the server's cap (46 § Interactions) and the page does not second-guess it in
    // either direction — it renders the list it was handed.
    expect(container.querySelectorAll('.home-prompt')).toHaveLength(2);
    expect(screen.getByText('Start a plithe')).toBeTruthy();
    expect(screen.getByText('More people than seats')).toBeTruthy();
  });
});

describe('when the request fails', () => {
  it('keeps the numbers on screen and says they are stale', () => {
    home = { data: FULL, loading: false, error: new Error('offline') };
    mount();
    expect(screen.getByRole('alert').textContent).toMatch(/last successful load/);
    expect(screen.getByText('Spring check')).toBeTruthy();
  });

  it('offers a retry when there is nothing to show at all', () => {
    home = { data: null, loading: false, error: new Error('offline') };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalled();
  });

  it('shows skeletons rather than zeroes while it loads', () => {
    home = { data: null, loading: true, error: null };
    const { container } = mount();
    expect(container.querySelectorAll('.home-skeleton')).toHaveLength(4);
    expect(screen.queryByText('0')).toBeNull();
  });
});
