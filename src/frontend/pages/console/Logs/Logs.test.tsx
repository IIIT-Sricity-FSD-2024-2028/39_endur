import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { AuditEntry, Capability, Page } from '@endur/shared';
import { renderWithProviders, stubApi } from '../../../test-utils.js';
import Logs from './index.js';

const row = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: '1',
  at: '2026-08-25T10:00:00.000Z',
  actor: { id: 'u-1', name: 'Priya Nair', avatarUrl: null },
  action: 'unit.update',
  target: { type: 'unit', id: 'n-1', name: 'North wing' },
  outcome: 'allowed',
  decidedBy: {
    grantId: 'g-1', via: 'role', subjectName: 'Dean', scope: 'subtree',
    anchorUnitName: 'School of Engineering', effect: 'allow',
  },
  requestId: 'req-1',
  ...over,
});

let rows: AuditEntry[];
let requested: string[];

const page = (data: AuditEntry[]): Page<AuditEntry> => ({
  data,
  page: { nextCursor: null, hasMore: false },
  meta: { total: data.length },
});

// The stub server (R-502): the real hook and the real cache run above it.
const server = () => stubApi({
  'GET /audit*': (call) => {
    requested.push(call.path);
    return { body: page(rows) };
  },
});

const ALL: Capability[] = ['audit.read'];
const mount = (capabilities: Capability[] = ALL, path = '/app/logs') =>
  renderWithProviders(<Logs />, { capabilities, path });

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  server();
  rows = [row()];
  requested = [];
});

describe('/app/logs', () => {
  it('renders the access screen without audit.read, and asks nothing', async () => {
    mount([]);
    expect(await screen.findByText(/do not have access/i)).toBeTruthy();
    expect(requested.length).toBe(0);
  });

  it('says WHY, not only what — the trace expands to the full sentence', async () => {
    mount();
    expect(await screen.findByText(/change .* structure|unit\.update|rename/i)).toBeTruthy();
    const expand = screen.getByRole('button', { expanded: false });
    expect(expand.textContent).toContain('Dean');

    fireEvent.click(expand);
    expect(screen.getByText(/and everything under it/)).toBeTruthy();
    expect(screen.getByText(/req-1/)).toBeTruthy();
  });

  it('shows a response submission as the row that names nobody', async () => {
    rows = [row({ actor: null, action: 'response.submit', target: { type: 'campaign', id: 'c-1', name: 'Autumn round' }, decidedBy: null })];
    mount();
    expect(await screen.findByText(/not a signed-in person/i)).toBeTruthy();
    expect(screen.queryByText('Priya Nair')).toBeNull();
    expect(screen.getByText(/no grant was recorded/i)).toBeTruthy();
  });

  it('still renders a row whose target has been deleted', async () => {
    rows = [row({ target: { type: 'unit', id: 'abcdef12-0000-0000-0000-000000000000', name: null } })];
    mount();
    expect(await screen.findByText(/\(deleted\)/)).toBeTruthy();
  });

  it('puts the refusals-only toggle in the URL, so a filtered log is a link', async () => {
    mount();
    await screen.findByRole('button', { expanded: false });
    fireEvent.click(screen.getByLabelText(/show refusals only/i));

    expect(requested.some((path) => path.includes('outcome=denied'))).toBe(true);
  });

  it('marks a refusal with the word, never the colour alone', async () => {
    rows = [row({ outcome: 'denied', action: 'campaign.launch' })];
    mount();
    expect(await screen.findByText('Refused')).toBeTruthy();
  });

  it('distinguishes an empty log from a filter that matched nothing', async () => {
    rows = [];
    const first = mount();
    expect(await screen.findByText(/nothing has been recorded yet/i)).toBeTruthy();
    first.unmount();

    mount(ALL, '/app/logs?outcome=denied');
    expect(await screen.findByText(/nothing matches those filters/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeTruthy();
  });
});
