import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { PlatformCapability, PlatformOrgDetail } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import OrgDetail from './OrgDetail.js';

const ORG: PlatformOrgDetail = {
  id: 'org-1',
  name: 'Northfield',
  slug: 'northfield',
  industry: 'university',
  tier: 'silver',
  subscriptionStatus: 'active',
  periodEnd: '2026-09-01T00:00:00.000Z',
  lapsedFrom: null,
  seats: 12,
  seatLimit: null,
  activeCampaigns: 2,
  responsesLast30d: 40,
  lastActivityAt: '2026-08-30T00:00:00.000Z',
  suspendedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  counts: { units: 4, roles: 3, people: 12, subjects: 6, campaigns: 2, responses: 40 },
  administrators: [{ id: 'u1', name: 'Amara Rao', email: 'amara@example.test' }],
  planHistory: [],
};

let org: PlatformOrgDetail = ORG;
let held: PlatformCapability[] = [];
const opsPost = vi.fn();
const reload = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useParams: () => ({ id: 'org-1' }), useNavigate: () => vi.fn() };
});

vi.mock('../../../lib/estate.js', () => ({
  useOrgDetail: () => ({ data: org, loading: false, error: null, forbidden: false, reload }),
}));

vi.mock('../../../lib/opsCapabilities.js', () => ({
  useOpsCan: () => (capability: PlatformCapability) => held.includes(capability),
}));

vi.mock('../../../lib/ops.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    opsPost: (path: string, body: unknown) => opsPost(path, body) as Promise<unknown>,
  };
});

const render = () => renderWithProviders(<OrgDetail />, { path: '/ops/orgs/org-1' });

beforeEach(() => {
  org = ORG;
  held = ['platform.org.read', 'platform.org.suspend'] as PlatformCapability[];
  opsPost.mockReset();
  opsPost.mockResolvedValue({ data: {} });
  reload.mockReset();
  reload.mockResolvedValue(undefined);
});

describe('reinstating actually reinstates — D-043', () => {
  it('sends the request when a suspended organisation is reinstated', async () => {
    org = { ...ORG, suspendedAt: '2026-08-20T00:00:00.000Z' };
    render();

    fireEvent.click(screen.getByRole('button', { name: 'Reinstate organisation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reinstate' }));

    await waitFor(() =>
      expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/suspend', { suspended: false }));
  });

  it('keeps the typed-name gate on suspend, and it is the button that refuses', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend organisation' }));

    const confirm = screen.getByRole('button', { name: 'Suspend' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.click(confirm);
    expect(opsPost).not.toHaveBeenCalled();
  });

  it('suspends once the name is typed', async () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend organisation' }));
    fireEvent.change(screen.getByLabelText(/Type "Northfield" to confirm/), {
      target: { value: 'Northfield' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    await waitFor(() =>
      expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/suspend', { suspended: true }));
  });
});

describe('the suspension card is absent for staff — DEC-104', () => {
  it('renders neither the button nor the heading without platform.org.suspend', () => {
    held = ['platform.org.read'] as PlatformCapability[];
    render();
    expect(screen.queryByRole('button', { name: /Suspend organisation/ })).toBeNull();
    expect(screen.queryByText(/Suspend this organisation/)).toBeNull();
    expect(screen.getByText('Northfield')).toBeTruthy();
  });

  it('renders it for an owner', () => {
    render();
    expect(screen.getByRole('button', { name: 'Suspend organisation' })).toBeTruthy();
  });
});
