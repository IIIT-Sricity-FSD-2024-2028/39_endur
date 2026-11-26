import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, CampaignDetail, CampaignSummary, Page } from '@endur/shared';
import {
  renderWithProviders, NONSENSE_LABELS, errorReply, heldReply, stubApi,
} from '../../../test-utils.js';
import Campaigns from './index.js';
import Detail from './Detail.js';

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined), toDataURL: vi.fn().mockResolvedValue('data:,') },
}));

const summary = (over: Partial<CampaignSummary> & { id: string; name: string }): CampaignSummary => ({
  status: 'open', templateId: 't1', templateName: 'Mid-term form',
  templateCategory: 'Course feedback', resultsThreshold: 5,
  subjectCount: 12, responseCount: 612, anonymous: true, access: 'public',
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

const ALL: Capability[] = [
  'campaign.read', 'campaign.create', 'campaign.launch', 'campaign.close', 'results.read',
];

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
    expect(screen.getByText(/suppression threshold/)).toBeTruthy();
  });

  it('launches a draft, and the launch is disabled while it is in flight', async () => {
    // The launch is a thunk over RTK Query (store/screens/campaigns.ts): the request itself
    // goes to the stubbed server, held until the test releases it.
    const held = heldReply({ body: { data: { url: 'https://x.test/r/K4M9X2PQ', publicToken: 'K4M9X2PQ', status: 'open' } } });
    const calls = stubApi({
      'POST /campaigns/c1/launch': () => held.promise,
      'GET /campaigns/c1': { body: { data: detail({ status: 'open' }) } },
    });
    one = { data: detail({ status: 'draft', publicToken: null, url: null }), loading: false, error: null };
    mountDetail();

    const button = screen.getByRole('button', { name: /Launch plithe/ });
    fireEvent.click(button);
    fireEvent.click(button);
    const launches = calls.filter((call) => call.path === '/campaigns/c1/launch');
    expect(launches).toHaveLength(1);
    expect(launches[0]?.headers.get('idempotency-key')).toMatch(/^launch:c1:/);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Launching/ }).disabled).toBe(true);

    held.release();
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Share/ })).toBeTruthy());
    vi.unstubAllGlobals();
  });

  it('says why a launch was refused, and offers it again', async () => {
    stubApi({
      'POST /campaigns/c1/launch': errorReply(409, 'CONFLICT', 'Its closing time has already passed.'),
    });
    one = { data: detail({ status: 'draft', publicToken: null, url: null }), loading: false, error: null };
    mountDetail();
    fireEvent.click(screen.getByRole('button', { name: /Launch plithe/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already passed/);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Launch plithe/ }).disabled).toBe(false);
    vi.unstubAllGlobals();
  });

  it('closes once confirmed, and the confirmation goes', async () => {
    const calls = stubApi({ 'POST /campaigns/c1/close': { body: { data: detail({ status: 'closed' }) } } });
    mountDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Close early' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(calls.some((call) => call.path === '/campaigns/c1/close')).toBe(true));
    vi.unstubAllGlobals();
  });

  it('closing states the real count and what is kept', () => {
    mountDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Close early' }));
    const dialog = within(screen.getByRole('alertdialog'));
    expect(dialog.getByText(/612 responses have come in/)).toBeTruthy();
    expect(dialog.getByText(/the results stay/)).toBeTruthy();
  });

  // R-805: a scheduled campaign could not be called off at all; the server always allowed it.
  it('calls off a scheduled one, saying it will never open, through the same close', async () => {
    const calls = stubApi({ 'POST /campaigns/c1/close': { body: { data: detail({ status: 'closed' }) } } });
    one = { data: detail({ status: 'scheduled', responseCount: 0 }), loading: false, error: null };
    mountDetail();
    expect(screen.queryByRole('button', { name: 'Close early' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Call it off' }));
    const dialog = within(screen.getByRole('alertdialog'));
    expect(dialog.getByText(/it will never open/)).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Call it off' }));
    await waitFor(() => expect(calls.some((call) => call.path === '/campaigns/c1/close')).toBe(true));
    vi.unstubAllGlobals();
  });

  it('offers no Close on something already closed, and no Launch on something open', () => {
    one = { data: detail({ status: 'closed', closedAt: '2026-08-26T00:00:00.000Z' }), loading: false, error: null };
    mountDetail();
    expect(screen.queryByRole('button', { name: 'Close early' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Launch/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Results' })).toBeTruthy();
  });

  it('offers no Results to somebody who may not read them', () => {
    one = { data: detail({ status: 'closed', closedAt: '2026-08-26T00:00:00.000Z' }), loading: false, error: null };
    mountDetail(['campaign.read']);
    expect(screen.queryByRole('link', { name: 'Results' })).toBeNull();
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
