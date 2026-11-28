// `/ops/audit` through the real store and a stubbed operator API (R-716): the filters are
// `state.opsReports.audit`, each filter is its own cached list, and what each entry says is
// `selectAuditView`'s.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { PlatformAuditEntry } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import { auditFilterChanged } from '../../../store/screens/opsReports.js';
import Audit from './index.js';

const entry = (id: string, patch: Partial<PlatformAuditEntry>): PlatformAuditEntry => ({
  id, at: '2026-11-27T09:00:00.000Z', actor: { id: 'op1', name: 'Endur Owner' }, action: 'logs.read',
  org: null, payload: null, requestId: `req-${id}`, ...patch,
});

const FIRST = [
  entry('3', {
    action: 'plan.override', org: { id: 'org-1', name: 'Northfield' }, payload: { from: 'bronze', to: 'gold' },
  }),
  entry('2', { action: 'org.suspend', org: { id: 'org-2', name: 'Riverside' } }),
];
const OLDER = [entry('1', { action: 'operator.create', payload: { email: 'new@endur.test', role: 'staff' } })];

let calls: StubCall[] = [];
const server = (routes: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({
    'GET /platform/audit': { body: { data: FIRST, page: { nextCursor: 'c1', hasMore: true }, meta: { total: 3 } } },
    'GET /platform/audit?cursor=c1': { body: { data: OLDER, page: { nextCursor: null, hasMore: false }, meta: { total: 3 } } },
    'GET /platform/audit?action=org.suspend': { body: { data: [FIRST[1]], page: { nextCursor: null, hasMore: false }, meta: { total: 1 } } },
    'GET /platform/audit?orgId=org-1': { body: { data: [FIRST[0]], page: { nextCursor: null, hasMore: false }, meta: { total: 1 } } },
    ...routes,
  });
};

beforeEach(() => server());
afterEach(() => vi.unstubAllGlobals());

const render = () => renderWithProviders(<Audit />, { path: '/ops/audit' });

/** The entries (the action names are also the filter's options, so never page-wide). */
const trail = async (): Promise<HTMLElement> => {
  await waitFor(() => expect(screen.queryByRole('list')?.textContent ?? '').toContain('Changed a plan'));
  return screen.getByRole('list');
};
const entries = (): string => screen.queryByRole('list')?.textContent ?? '';

describe('the audit trail', () => {
  it('says what each action changed, in words, and loads older entries onto the end', async () => {
    render();
    const list = await trail();
    expect(within(list).getByText('Changed a plan')).toBeTruthy();
    expect(within(list).getByText('Bronze → Gold')).toBeTruthy();
    expect(within(list).getByText('Suspended an organization')).toBeTruthy();
    expect(screen.getByText('2 shown of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load older' }));
    await waitFor(() => expect(entries()).toContain('Added an operator'));
    expect(entries()).toContain('new@endur.test as staff');
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();
  });

  it('filters by action through the store, and back', async () => {
    render();
    await trail();
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'org.suspend' } });
    await waitFor(() => expect(entries()).not.toContain('Changed a plan'));
    expect(entries()).toContain('Suspended an organization');
    expect(calls.map((call) => call.path)).toContain('/platform/audit?action=org.suspend');
    fireEvent.click(screen.getByRole('button', { name: 'Every action' }));
    await waitFor(() => expect(entries()).toContain('Changed a plan'));
  });

  it('opens narrowed to one organisation from its page, and says which', async () => {
    const { store } = render();
    await trail();
    act(() => {
      store.dispatch(auditFilterChanged({ orgId: 'org-1', orgName: 'Northfield' }));
    });
    expect(await screen.findByText('Organization: Northfield')).toBeTruthy();
    await waitFor(() => expect(entries()).not.toContain('Suspended an organization'));
    fireEvent.click(screen.getByRole('button', { name: 'Every organization' }));
    await waitFor(() => expect(entries()).toContain('Suspended an organization'));
  });

  it('a 403 names the capability', async () => {
    server({ 'GET /platform/audit': errorReply(403, 'FORBIDDEN', 'No.') });
    render();
    expect(await screen.findByText('platform.audit.read')).toBeTruthy();
  });
});
