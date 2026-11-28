// `/ops/orgs/:id` through the real store: the organisation is read through a mocked
// `useOrgDetail`, and every write is a thunk in store/screens/operator.ts that reaches the
// stubbed operator API, which asks the `opsPost` spy what to answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PlatformCapability, PlatformOrgDetail } from '@endur/shared';
import { OpsError } from '../../../lib/ops.js';
import { errorReply, renderWithProviders, stubApi, type StubReply } from '../../../test-utils.js';
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

/** The operator API's POSTs, answered by the spy: its value, or its `OpsError` refusal. The
 *  organisation's activity and support visits are plain GETs. */
const server = () => stubApi({
  'GET /platform/audit?orgId=org-1': {
    body: {
      data: [
        {
          id: 'a1', at: '2026-08-20T10:00:00.000Z', actor: { id: 'op1', name: 'Endur Owner' },
          action: 'plan.override', org: { id: 'org-1', name: 'Northfield' },
          payload: { from: 'bronze', to: 'silver' }, requestId: 'req-1',
        },
      ],
      page: { nextCursor: null, hasMore: false },
      meta: { total: 1 },
    },
  },
  'GET /platform/support-sessions?orgId=org-1': {
    body: {
      data: [
        {
          id: 's1', org: { id: 'org-1', name: 'Northfield' },
          operator: { id: 'op2', name: 'Endur Support', email: 'support@endur.test' },
          reason: 'Ticket 418, campaign will not launch', startedAt: '2026-08-21T10:00:00.000Z',
          expiresAt: '2026-08-21T11:00:00.000Z', endedAt: '2026-08-21T10:25:00.000Z', active: false,
        },
      ],
    },
  },
  'POST /platform/*': async (call): Promise<StubReply> => {
    try {
      return { body: (await opsPost(call.path.replace(/^\/platform/, ''), call.body)) ?? { data: {} } };
    } catch (error) {
      if (error instanceof OpsError) return errorReply(error.status, error.code, error.message);
      throw error;
    }
  },
});

afterEach(() => vi.unstubAllGlobals());

const render = () => renderWithProviders(<OrgDetail />, { path: '/ops/orgs/org-1' });

beforeEach(() => {
  server();
  org = ORG;
  held = [
    'platform.org.read', 'platform.org.suspend', 'platform.plan.override', 'platform.message.send',
  ] as PlatformCapability[];
  opsPost.mockReset();
  opsPost.mockResolvedValue({ data: {} });
  reload.mockReset();
  reload.mockResolvedValue(undefined);
});

describe('reinstating actually reinstates — D-043', () => {
  it('sends the request when a suspended organization is reinstated', async () => {
    org = { ...ORG, suspendedAt: '2026-08-20T00:00:00.000Z' };
    render();

    fireEvent.click(screen.getByRole('button', { name: 'Reinstate organization' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reinstate' }));

    await waitFor(() =>
      expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/suspend', { suspended: false }));
  });

  it('keeps the typed-name gate on suspend, and it is the button that refuses', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend organization' }));

    const confirm = screen.getByRole('button', { name: 'Suspend' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    fireEvent.click(confirm);
    expect(opsPost).not.toHaveBeenCalled();
  });

  it('suspends once the name is typed', async () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Suspend organization' }));
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
    expect(screen.queryByRole('button', { name: /Suspend organization/ })).toBeNull();
    expect(screen.queryByText(/Suspend this organization/)).toBeNull();
    expect(screen.getByText('Northfield')).toBeTruthy();
  });

  it('renders it for an owner', () => {
    render();
    expect(screen.getByRole('button', { name: 'Suspend organization' })).toBeTruthy();
  });
});

/** The "Set plan" button on the Gold card. */
const goldButton = (): HTMLElement => {
  const card = screen.getAllByText(/Gold/).map((node) => node.closest('.plan-card')).find(Boolean) as HTMLElement;
  return within(card).getByRole('button', { name: /Set plan/ });
};

describe('the plan override', () => {
  it('asks before it changes anything, then sets the tier and says so', async () => {
    render();
    fireEvent.click(goldButton());
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Change Northfield to Gold?');
    expect(opsPost).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Change plan' }));
    await waitFor(() => expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/plan', { tier: 'gold' }));
    expect(await screen.findByText('Plan set to gold.')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('cancels without a request', () => {
    render();
    fireEvent.click(goldButton());
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(opsPost).not.toHaveBeenCalled();
  });

  it('says why when the override is refused', async () => {
    opsPost.mockRejectedValue(new OpsError({ code: 'CONFLICT', status: 409, message: 'A change is pending.', requestId: 'r' }));
    render();
    fireEvent.click(goldButton());
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Change plan' }));
    expect((await screen.findByRole('alert')).textContent).toBe('A change is pending.');
  });
});

describe('support access — DEC-114', () => {
  it('needs a real reason, then opens a session with it', async () => {
    held = ['platform.org.read', 'platform.support.enter'] as PlatformCapability[];
    opsPost.mockResolvedValue({ data: { redirectTo: '/app' } });
    render();
    const open = screen.getByRole<HTMLButtonElement>('button', { name: 'Open console' });
    fireEvent.change(screen.getByLabelText(/Why are you going in/), { target: { value: 'short' } });
    expect(open.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Why are you going in/), {
      target: { value: '  Ticket 418, their campaign will not launch  ' },
    });
    fireEvent.click(open);
    await waitFor(() => expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/support-session', {
      reason: 'Ticket 418, their campaign will not launch',
    }));
  });

  it('says why when a session is refused, and lets them try again', async () => {
    held = ['platform.org.read', 'platform.support.enter'] as PlatformCapability[];
    opsPost.mockRejectedValue(new OpsError({ code: 'FORBIDDEN', status: 403, message: 'Suspended organizations cannot be entered.', requestId: 'r' }));
    render();
    fireEvent.change(screen.getByLabelText(/Why are you going in/), {
      target: { value: 'Ticket 418, their campaign will not launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open console' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Suspended organizations cannot be entered.');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Open console' }).disabled).toBe(false);
  });
});

describe('what operators have done here', () => {
  it('shows its activity and its support visits, each from its own register', async () => {
    held = [...held, 'platform.audit.read', 'platform.support.read'] as PlatformCapability[];
    render();
    const activity = await screen.findByRole('region', { name: 'Operator activity' });
    expect(await within(activity).findByText('Changed a plan')).toBeTruthy();
    expect(activity.textContent).toContain('Bronze → Silver');
    const visits = screen.getByRole('region', { name: 'Support visits' });
    expect(await within(visits).findByText('Endur Support')).toBeTruthy();
    expect(visits.textContent).toContain('25 min');
  });

  it('asks for neither without the capabilities', () => {
    render();
    expect(screen.queryByRole('region', { name: 'Operator activity' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Support visits' })).toBeNull();
  });
});

describe('the plan picker without the override capability', () => {
  it('shows the plans, with nothing to press', () => {
    held = ['platform.org.read'] as PlatformCapability[];
    render();
    expect(screen.queryByRole('button', { name: /Set plan/ })).toBeNull();
  });
});

describe('messaging the administrators', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: ' Your plan ' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: ' It renews on Thursday. ' } });
  };

  it('says where the message goes, and that nothing is emailed', () => {
    render();
    expect(screen.getByText(/lands in their Endur inbox/)).toBeTruthy();
    expect(screen.getByText(/Nothing is emailed/)).toBeTruthy();
  });

  it('sends the words, trimmed, says how many got it, and empties the box', async () => {
    opsPost.mockResolvedValue({ data: { sentTo: 1 } });
    render();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(opsPost).toHaveBeenCalledWith('/orgs/org-1/message', {
      subject: 'Your plan', body: 'It renews on Thursday.',
    }));
    expect(await screen.findByText('Sent to 1 administrator.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Subject').value).toBe('');
  });

  it('keeps the words when it did not go', async () => {
    opsPost.mockRejectedValue(new OpsError({ code: 'INTERNAL', status: 500, message: 'Try again.', requestId: 'r' }));
    render();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Try again.');
    expect(screen.getByLabelText<HTMLInputElement>('Subject').value).toBe(' Your plan ');
  });
});
