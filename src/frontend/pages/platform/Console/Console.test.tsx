// `/ops` through the real store and a stubbed operator API (R-716): the filters are
// `state.opsReports.estate`, the rows and the numbers come from RTK Query's cache, and every
// figure on the page is a selector's. Nothing here mocks a hook.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PlatformCapability, PlatformOrgSummary, PlatformStats } from '@endur/shared';
import { renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import { selectEstateFilters } from '../../../store/screens/opsReports.js';
import Console from './index.js';

const ROW: PlatformOrgSummary = {
  id: 'org-1',
  name: 'Northfield',
  slug: 'northfield',
  industry: 'university',
  tier: 'gold',
  subscriptionStatus: 'active',
  periodEnd: null,
  lapsedFrom: null,
  seats: 12,
  seatLimit: 10,
  activeCampaigns: 2,
  responsesLast30d: 40,
  lastActivityAt: '2026-10-10T00:00:00.000Z',
  suspendedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

const QUIET: PlatformOrgSummary = {
  ...ROW, id: 'org-2', name: 'Riverside', slug: 'riverside', tier: 'bronze', seats: 3, seatLimit: null,
  responsesLast30d: 0, lastActivityAt: '2026-06-01T00:00:00.000Z', suspendedAt: '2026-09-01T00:00:00.000Z',
};

const STATS: PlatformStats = {
  organizations: 50, suspended: 2, byTier: { bronze: 20, silver: 10, gold: 17, enterprise: 3 },
  seats: 190, campaigns: 12, responses: 4800,
};

let held: PlatformCapability[] = [];
vi.mock('../../../lib/opsCapabilities.js', () => ({
  useOpsCan: () => (capability: PlatformCapability) => held.includes(capability),
}));

let calls: StubCall[] = [];
const estateCalls = (): string[] =>
  calls.filter((call) => call.method === 'GET' && call.path.startsWith('/platform/orgs')).map((call) => call.path);

beforeEach(() => {
  held = ['platform.org.read', 'platform.usage.read'] as PlatformCapability[];
  calls = stubApi({
    'GET /platform/orgs*': { body: { data: [ROW, QUIET], page: { nextCursor: null, hasMore: false }, meta: { total: 2 } } },
    'GET /platform/stats': { body: { data: STATS } },
  });
});
afterEach(() => vi.unstubAllGlobals());

const render = () => renderWithProviders(<Console />, { path: '/ops' });
const search = (): HTMLInputElement => screen.getByLabelText('Search organizations by name');

describe('the estate’s numbers', () => {
  it('prints the counts the server sent and the shares the selector worked out', async () => {
    render();
    const kpis = await screen.findByRole('region', { name: 'The estate in numbers' });
    expect(within(kpis).getByText('50')).toBeTruthy();
    // 48 of 50 not suspended: the selector's 96%, never the server's.
    expect(kpis.textContent).toContain('96% active');
    expect(kpis.textContent).toContain('3.8 per organization');
    const mix = screen.getByRole('region', { name: 'Plan mix' });
    expect(mix.textContent).toContain('Gold 17');
    expect(mix.textContent).toContain('34%');
  });

  it('asks for no numbers without platform.usage.read', async () => {
    held = ['platform.org.read'] as PlatformCapability[];
    render();
    await screen.findByText('Northfield');
    expect(calls.some((call) => call.path === '/platform/stats')).toBe(false);
    expect(screen.queryByRole('region', { name: 'The estate in numbers' })).toBeNull();
  });
});

describe('the list', () => {
  it('flags what needs attention, and puts the quietest first', async () => {
    render();
    await screen.findByText('Riverside');
    const table = screen.getByRole('table', { name: 'Organizations' });
    const names = within(table).getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['Riverside', 'Northfield']);
    expect(within(table).getByText('Over seats')).toBeTruthy();
    expect(within(table).getByText('Suspended')).toBeTruthy();
    expect(within(table).getByText('12 / 10')).toBeTruthy();
    expect(screen.getByLabelText('Flags in this list').textContent).toContain('1 quiet');
  });

  it('re-orders by the chosen sort without asking the server again', async () => {
    render();
    await screen.findByText('Riverside');
    const before = estateCalls().length;
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'name' } });
    const names = within(screen.getByRole('table', { name: 'Organizations' })).getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['Northfield', 'Riverside']);
    expect(estateCalls().length).toBe(before);
  });
});

describe('the search box and filters', () => {
  it('asks nothing new while somebody is still typing; Enter searches, trimmed', async () => {
    const { store } = render();
    await screen.findByText('Northfield');
    fireEvent.change(search(), { target: { value: '  North  ' } });
    expect(search().value).toBe('  North  ');
    expect(selectEstateFilters(store.getState()).q).toBeNull();

    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(selectEstateFilters(store.getState()).q).toBe('North');
    await waitFor(() => expect(estateCalls()).toContain('/platform/orgs?q=North'));
  });

  it('searches when the box loses focus, and an empty box clears the search', async () => {
    const { store } = render();
    await screen.findByText('Northfield');
    fireEvent.change(search(), { target: { value: 'North' } });
    fireEvent.blur(search());
    expect(selectEstateFilters(store.getState()).q).toBe('North');
    fireEvent.change(search(), { target: { value: '' } });
    fireEvent.blur(search());
    expect(selectEstateFilters(store.getState()).q).toBeNull();
  });

  it('puts the chosen plan into the request, and "Clear filters" takes it out', async () => {
    render();
    await screen.findByText('Northfield');
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'silver' } });
    await waitFor(() => expect(estateCalls()).toContain('/platform/orgs?tier=silver'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText<HTMLSelectElement>('Plan').value).toBe('');
  });

  it('keeps the filters after a look elsewhere: they are in the store, not the page', async () => {
    const first = render();
    await screen.findByText('Northfield');
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'gold' } });
    first.unmount();
    renderWithProviders(<Console />, { path: '/ops' }, first.store);
    expect(screen.getByLabelText<HTMLSelectElement>('Plan').value).toBe('gold');
  });
});
