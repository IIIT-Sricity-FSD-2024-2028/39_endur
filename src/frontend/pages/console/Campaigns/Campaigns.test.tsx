// T-038 — /app/campaigns and /app/campaigns/:id. 38, 06 §6.1 and §6.4.
//
// The assertion that matters most here is the cheapest-looking one: **Share is a top-level
// button on the card.** On demo day, list → projected QR must be one click, and a `⋯` menu
// is a second click plus a hunt.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, CampaignDetail, CampaignSummary, Page } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Campaigns from './index.js';
import Detail from './Detail.js';

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined), toDataURL: vi.fn().mockResolvedValue('data:,') },
}));

const summary = (over: Partial<CampaignSummary> & { id: string; name: string }): CampaignSummary => ({
  status: 'open', templateId: 't1', templateName: 'Mid-term form',
  subjectCount: 12, responseCount: 612, anonymous: true,
  startsAt: '2026-08-11T09:00:00.000Z', endsAt: '2026-08-26T23:59:00.000Z', closedAt: null,
  publicToken: 'K4M9X2PQ', url: 'https://feedback.example.test/r/K4M9X2PQ',
  createdAt: '2026-08-01T00:00:00.000Z', ...over,
});

const ROWS: CampaignSummary[] = [
  summary({ id: 'c1', name: 'Spring check' }),
  summary({ id: 'c2', name: 'Not launched', status: 'draft', publicToken: null, url: null, responseCount: 0 }),
];

const page = (rows: CampaignSummary[]): Page<CampaignSummary> => ({
  data: rows, page: { nextCursor: null, hasMore: false }, meta: { total: rows.length },
});

const detail = (over: Partial<CampaignDetail> = {}): CampaignDetail => ({
  ...summary({ id: 'c1', name: 'Spring check' }),
  audience: { kind: 'anyone' },
  subjects: [
    { id: 's1', name: 'Data Structures', unitName: 'Engineering' },
    { id: 's2', name: 'Thermodynamics', unitName: 'Engineering' },
  ],
  ...over,
});

const reload = vi.fn();
const launch = vi.fn();
const close = vi.fn();
let list: { data: Page<CampaignSummary> | null; loading: boolean; error: Error | null };
let one: { data: CampaignDetail | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/campaigns.js', () => ({
  launchKey: (id: string) => `key-for-${id}`,
  launchCampaign: vi.fn(),
  campaignSearch: () => '',
  useCampaignList: () => ({ ...list, reload, create: vi.fn() }),
  useCampaign: () => ({ ...one, reload, update: vi.fn(), launch, close }),
  useAudiencePreview: () => ({ data: null, loading: false, error: null }),
}));

const ALL: Capability[] = ['campaign.read', 'campaign.create', 'campaign.launch', 'campaign.close'];

const mountList = (capabilities: Capability[] = ALL, path = '/app/campaigns') =>
  renderWithProviders(
    <Routes>
      <Route path="/app/campaigns" element={<Campaigns />} />
      <Route path="/app/campaigns/new" element={<p>NEW</p>} />
      <Route path="/app/campaigns/:id" element={<p>DETAIL</p>} />
      <Route path="/app/campaigns/:id/results" element={<p>RESULTS</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path },
  );

const mountDetail = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/campaigns/:id" element={<Detail />} />
      <Route path="/app/campaigns" element={<p>LIST</p>} />
      <Route path="/app/campaigns/:id/results" element={<p>RESULTS</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/campaigns/c1' },
  );

const card = (name: string): HTMLElement =>
  screen.getByText(name).closest('article') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  reload.mockResolvedValue(undefined);
  launch.mockResolvedValue({ publicToken: 'K4M9X2PQ', url: 'https://x.test/r/K4M9X2PQ', status: 'open' });
  close.mockResolvedValue(undefined);
  list = { data: page(ROWS), loading: false, error: null };
  one = { data: detail(), loading: false, error: null };
});

describe('the list card is one click from a projected QR', () => {
  it('puts Share on the card itself, not behind a menu', () => {
    mountList();
    expect(within(card('Spring check')).getByRole('button', { name: /Share/ })).toBeTruthy();
  });

  it('opens the share sheet in place', () => {
    mountList();
    fireEvent.click(within(card('Spring check')).getByRole('button', { name: /Share/ }));
    expect(screen.getByRole('dialog', { name: /Share Spring check/ })).toBeTruthy();
  });

  it('offers nothing to share on a DRAFT — it has no token and no reachable URL', () => {
    mountList();
    // 38 § States. A draft that offered a Share button would be offering a dead link.
    expect(within(card('Not launched')).queryByRole('button', { name: /Share/ })).toBeNull();
    expect(within(card('Not launched')).queryByRole('link', { name: 'Results' })).toBeNull();
  });

  it('shows the status tag and the timing line', () => {
    mountList();
    expect(within(card('Spring check')).getByText('Collecting')).toBeTruthy();
    expect(within(card('Not launched')).getByText('Draft')).toBeTruthy();
  });

  it('names the counts in the org\'s own words (INV-001)', () => {
    mountList();
    expect(within(card('Spring check')).getByText(/12 Quaxels/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /New plithe/ })).toBeTruthy();
  });

  it('filters by status, and status is DERIVED — the page only ever reads it', () => {
    mountList(ALL, '/app/campaigns?status=draft');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Draft' }).checked).toBe(true);
  });

  it('sends somebody with nothing to the create flow', () => {
    list = { data: page([]), loading: false, error: null };
    mountList();
    expect(screen.getByText('No Plithes yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Create a plithe/ })).toBeTruthy();
  });

  it('offers to clear a filter that matched nothing, rather than the create action', () => {
    list = { data: page([]), loading: false, error: null };
    mountList(ALL, '/app/campaigns?status=closed');
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeTruthy();
  });
});

describe('the detail page', () => {
  it('reaches the share sheet forever, not only after launch', () => {
    mountDetail();
    fireEvent.click(screen.getByRole('button', { name: /Share/ }));
    expect(screen.getByRole('dialog', { name: /Share Spring check/ })).toBeTruthy();
  });

  it('shows the counts it can actually answer', () => {
    mountDetail();
    expect(screen.getByText('612')).toBeTruthy();
    expect(screen.getByText('Data Structures')).toBeTruthy();
    // design_specs §6.4 draws a per-subject breakdown; those numbers live behind the
    // k-anonymity gate on the results screen, and a second ungated path to them is exactly
    // what INV-007 exists to prevent.
    expect(screen.getByText(/suppression threshold/)).toBeTruthy();
  });

  it('launches a draft, and the launch is disabled while it is in flight', async () => {
    let release: (value: unknown) => void = () => undefined;
    launch.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    one = { data: detail({ status: 'draft', publicToken: null, url: null }), loading: false, error: null };
    mountDetail();

    const button = screen.getByRole('button', { name: /Launch plithe/ });
    fireEvent.click(button);
    fireEvent.click(button);
    // Minting the token is irreversible; a double-click must not produce two links.
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith('key-for-c1');

    release({ url: 'https://x.test/r/K4M9X2PQ' });
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Share/ })).toBeTruthy());
  });

  it('closing states the real count and what is kept', () => {
    mountDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Close early' }));
    const dialog = within(screen.getByRole('alertdialog'));
    expect(dialog.getByText(/612 responses have come in/)).toBeTruthy();
    expect(dialog.getByText(/the results stay/)).toBeTruthy();
  });

  it('offers no Close on something already closed, and no Launch on something open', () => {
    one = { data: detail({ status: 'closed', closedAt: '2026-08-26T00:00:00.000Z' }), loading: false, error: null };
    mountDetail();
    expect(screen.queryByRole('button', { name: 'Close early' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Launch/ })).toBeNull();
    // Results outlive the campaign, which is the point of closing rather than deleting.
    expect(screen.getByRole('link', { name: 'Results' })).toBeTruthy();
  });

  it('hides launch and close without the capability, and still renders the page', () => {
    one = { data: detail({ status: 'draft', publicToken: null, url: null }), loading: false, error: null };
    mountDetail(['campaign.read']);
    expect(screen.queryByRole('button', { name: /Launch/ })).toBeNull();
    expect(screen.getByText('Spring check')).toBeTruthy();
  });

  it('a missing campaign is a page, not a blank screen', () => {
    one = { data: null, loading: false, error: new Error('gone') };
    mountDetail();
    expect(screen.getByRole('heading', { name: /not here/i })).toBeTruthy();
  });
});
