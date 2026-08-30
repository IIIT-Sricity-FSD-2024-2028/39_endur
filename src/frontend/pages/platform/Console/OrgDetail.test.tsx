// `/ops/orgs/:id` — the two verbs on the suspension card. T-103, D-043, DEC-104.
//
// THIS FILE EXISTS BECAUSE REINSTATE HAD NEVER WORKED AND NOTHING WOULD HAVE SAID SO. The
// backend route is tested (`platform.test.ts` asserts the 403 and the write); the PAGE had no
// test at all, and the failure was entirely in the page — one handler guarding both verbs on
// a field only one of them has, returning before making any request.
//
// A SILENT EARLY RETURN IS THE HARDEST KIND OF BUG TO SEE FROM THE INSIDE: no request, no
// error, no toast, the dialog still open. It looks exactly like a slow network. So the
// assertion that matters is on the REQUEST — `opsPost` was called — rather than on anything
// the screen says afterwards.
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
    // Only the write is intercepted. `OpsError` stays real, because the page catches it by
    // instance — a stubbed class would make every error path fall through to the generic copy
    // and the test would stop being able to see the difference.
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
  /**
   * THE BUG, AS A TEST. `confirmSuspend` guarded BOTH verbs on `suspendConfirmText !==
   * org.name`, and the reinstate dialog is a plain `<ConfirmDialog>` with no name field — so
   * the text was always empty, the guard always fired, and the handler returned before making
   * any request. Nothing could be brought back, which is also the likeliest reading of the
   * report that suspension "suspends every org": suspensions accumulated with no way out
   * (`N-067`).
   */
  it('sends the request when a suspended organisation is reinstated', async () => {
    org = { ...ORG, suspendedAt: '2026-08-20T00:00:00.000Z' };
    render();

    fireEvent.click(screen.getByRole('button', { name: 'Reinstate organisation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reinstate' }));

    await waitFor(() =>
      expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/suspend', { suspended: false }));
  });

  /**
   * AND SUSPENDING STILL NEEDS THE TYPED NAME. The fix moved the check onto one direction; it
   * did not delete it. The button is the guard — this asserts the button, because a `disabled`
   * control is a refusal a person can SEE, and the early return that used to back it up is
   * indistinguishable from a broken app.
   */
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
    // The message composer on the same page has textboxes too, so the field is found by its
    // label — which is also the label the operator reads before typing a destructive name.
    fireEvent.change(screen.getByLabelText(/Type "Northfield" to confirm/), {
      target: { value: 'Northfield' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

    await waitFor(() =>
      expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/suspend', { suspended: true }));
  });
});

describe('the suspension card is absent for staff — DEC-104', () => {
  /**
   * ABSENT FROM THE DOM, NOT HIDDEN. `70`'s acceptance list already demands that of the
   * analytics tab, and this control was the one affordance on the surface that disagreed.
   * The HEADING goes with the button: a card explaining what suspension does and offering
   * nothing actionable is worse than the greyed button was.
   */
  it('renders neither the button nor the heading without platform.org.suspend', () => {
    held = ['platform.org.read'] as PlatformCapability[];
    render();
    expect(screen.queryByRole('button', { name: /Suspend organisation/ })).toBeNull();
    expect(screen.queryByText(/Suspend this organisation/)).toBeNull();
    // The rest of the page is untouched — this is one section, not a permission wall.
    expect(screen.getByText('Northfield')).toBeTruthy();
  });

  it('renders it for an owner', () => {
    render();
    expect(screen.getByRole('button', { name: 'Suspend organisation' })).toBeTruthy();
  });
});
