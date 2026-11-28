// `/ops/support` through the real store and a stubbed operator API (R-716): one request for
// the register, and the switch between all, open and over is `selectSupportView`'s, so it
// asks the server nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { SupportSessionRow } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import Support from './index.js';

const visit = (id: string, patch: Partial<SupportSessionRow>): SupportSessionRow => ({
  id, org: { id: 'org-1', name: 'Northfield' }, operator: { id: 'op2', name: 'Endur Support', email: 'support@endur.test' },
  reason: `Ticket ${id}`, startedAt: '2026-11-27T09:00:00.000Z', expiresAt: '2026-11-27T10:00:00.000Z',
  endedAt: null, active: false, ...patch,
});

const ROWS = [
  visit('1', { active: true }),
  visit('2', { endedAt: '2026-11-27T09:30:00.000Z', org: { id: 'org-2', name: 'Riverside' } }),
  visit('3', {}),
];

let calls: StubCall[] = [];
beforeEach(() => {
  calls = stubApi({ 'GET /platform/support-sessions': { body: { data: ROWS } } });
});
afterEach(() => vi.unstubAllGlobals());

const render = () => renderWithProviders(<Support />, { path: '/ops/support' });

describe('the support register', () => {
  it('counts what is open, who went where, and how long a finished visit lasts', async () => {
    render();
    const kpis = await screen.findByRole('region', { name: 'The register in numbers' });
    expect(await within(kpis).findByText('3')).toBeTruthy();
    expect(kpis.textContent).toContain('to 2 organizations, by 1 operator');
    // (30 + 60) / 2.
    expect(kpis.textContent).toContain('45 min');
  });

  it('switches between all, open now and over without another request', async () => {
    render();
    await screen.findByText('“Ticket 1”');
    const table = (): HTMLElement => screen.getByRole('table', { name: 'Support visits' });
    expect(within(table()).getAllByRole('row')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: /^Open now/ }));
    expect(within(table()).getAllByRole('row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Over/ }));
    expect(within(table()).getAllByRole('row')).toHaveLength(3);
    expect(within(table()).getByText('Ran out')).toBeTruthy();
    expect(within(table()).getByText('30 min')).toBeTruthy();
    expect(calls.filter((call) => call.path.startsWith('/platform/support-sessions'))).toHaveLength(1);
  });

  it('a 403 names the capability', async () => {
    stubApi({ 'GET /platform/support-sessions': errorReply(403, 'FORBIDDEN', 'No.') });
    render();
    expect(await screen.findByText('platform.support.read')).toBeTruthy();
  });
});
