import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { PlatformCapability, PlatformOrgSummary } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import type { EstateFilters } from '../../../lib/estate.js';
import Console from './index.js';

const ROW: PlatformOrgSummary = {
  id: 'org-1',
  name: 'Northfield',
  slug: 'northfield',
  industry: 'university',
  tier: 'gold',
  subscriptionStatus: 'active',
  periodEnd: '2026-11-01T00:00:00.000Z',
  lapsedFrom: null,
  seats: 12,
  seatLimit: null,
  activeCampaigns: 2,
  responsesLast30d: 40,
  lastActivityAt: '2026-10-10T00:00:00.000Z',
  suspendedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

// Every filter set the page has asked the estate for, newest last.
const asked: EstateFilters[] = [];

vi.mock('../../../lib/estate.js', () => ({
  useEstate: (filters: EstateFilters) => {
    asked.push(filters);
    return {
      data: { data: [ROW], page: { nextCursor: null, hasMore: false }, meta: { total: 1 } },
      loading: false,
      error: null,
      forbidden: false,
      rows: [ROW],
      loadMore: vi.fn(),
      loadingMore: false,
      reload: vi.fn(),
    };
  },
  useEnterpriseQueue: () => ({
    rows: [],
    loading: false,
    error: null,
    update: vi.fn(),
    approve: vi.fn(),
  }),
}));

vi.mock('../../../lib/opsCapabilities.js', () => ({
  useOpsCan: () => (capability: PlatformCapability) => capability === 'platform.org.read',
}));

const latest = (): EstateFilters => asked[asked.length - 1]!;
const search = (): HTMLInputElement => screen.getByLabelText('Search organisations by name');

beforeEach(() => {
  asked.length = 0;
});

describe('the estate search box', () => {
  it('is controlled, and asks nothing new while somebody is still typing', () => {
    renderWithProviders(<Console />, { path: '/ops' });
    fireEvent.change(search(), { target: { value: 'North' } });
    expect(search().value).toBe('North');
    expect(latest().q).toBeUndefined();
  });

  it('searches on Enter, trimmed', () => {
    renderWithProviders(<Console />, { path: '/ops' });
    fireEvent.change(search(), { target: { value: '  North  ' } });
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(latest().q).toBe('North');
  });

  it('searches when the box loses focus, and clears the filter when emptied', () => {
    renderWithProviders(<Console />, { path: '/ops' });
    fireEvent.change(search(), { target: { value: 'North' } });
    fireEvent.blur(search());
    expect(latest().q).toBe('North');

    fireEvent.change(search(), { target: { value: '' } });
    fireEvent.blur(search());
    expect(latest().q).toBeUndefined();
  });

  it('starts from the search already in the link', () => {
    renderWithProviders(<Console />, { path: '/ops?q=North&tier=gold' });
    expect(search().value).toBe('North');
    expect(latest()).toMatchObject({ q: 'North', tier: 'gold' });
  });
});

describe('the estate filters', () => {
  it('puts the chosen tier into the request', () => {
    renderWithProviders(<Console />, { path: '/ops' });
    fireEvent.change(screen.getByDisplayValue('Any tier'), { target: { value: 'silver' } });
    expect(latest().tier).toBe('silver');
  });
});
