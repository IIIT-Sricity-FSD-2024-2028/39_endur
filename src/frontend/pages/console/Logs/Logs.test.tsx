// T-076 — /app/logs. 56 § Acceptance, the page half.
//
// Short on purpose. The scope filtering, the refusal rows and the absent `ip` are the
// SERVER's and `test/audit.test.ts` owns them. What matters here is that the page renders
// what it is told without deciding anything, and that the three rows most likely to be got
// wrong are got right: a submission that names nobody, a target that has been deleted, and
// the trace — which is the same component `42` renders (INV-009).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { AuditEntry, Capability, Page } from '@endur/shared';
import { renderWithProviders } from '../../../test-utils.js';
import Logs from './index.js';

const hoisted = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    details: Record<string, unknown>;
    constructor(status: number, message: string, details: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.details = details;
    }
  }
  return { ApiError };
});

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

let rows: AuditEntry[] | (() => never);
let requested: string[];

const page = (data: AuditEntry[]): Page<AuditEntry> => ({
  data,
  page: { nextCursor: null, hasMore: false },
  meta: { total: data.length },
});

const apiGet = vi.fn((path: string) => {
  requested.push(path);
  if (typeof rows === 'function') return rows();
  return page(rows);
});

vi.mock('../../../lib/api.js', () => ({
  apiGet: (p: string) => apiGet(p),
  apiPost: vi.fn(), apiPut: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(),
  ApiError: hoisted.ApiError,
}));

const ALL: Capability[] = ['audit.read'];
const mount = (capabilities: Capability[] = ALL, path = '/app/logs') =>
  renderWithProviders(<Logs />, { capabilities, path });

beforeEach(() => {
  vi.clearAllMocks();
  rows = [row()];
  requested = [];
});

describe('/app/logs', () => {
  it('renders the access screen without audit.read, and asks nothing', async () => {
    mount([]);
    expect(await screen.findByText(/do not have access/i)).toBeTruthy();
    // A request nobody may answer is a request not worth making.
    expect(requested.length).toBe(0);
  });

  it('says WHY, not only what — the trace expands to the full sentence', async () => {
    mount();
    expect(await screen.findByText(/change .* structure|unit\.update|rename/i)).toBeTruthy();
    // Compact in the row: the deciding grant and where it was anchored.
    const expand = screen.getByRole('button', { expanded: false });
    expect(expand.textContent).toContain('Dean');

    fireEvent.click(expand);
    // The full form spells out the SCOPE in words. `own_unit` on screen is a leaked
    // column name; "that thing and everything under it" is INV-005 in the past tense.
    expect(screen.getByText(/and everything under it/)).toBeTruthy();
    expect(screen.getByText(/req-1/)).toBeTruthy();
  });

  it('shows a response submission as the row that names nobody', async () => {
    rows = [row({ actor: null, action: 'response.submit', target: { type: 'campaign', id: 'c-1', name: 'Autumn round' }, decidedBy: null })];
    mount();
    // 56 § Anonymity rule 3, and the sentence is said out loud rather than left as a blank
    // cell somebody reads as a bug.
    expect(await screen.findByText(/not a signed-in person/i)).toBeTruthy();
    expect(screen.queryByText('Priya Nair')).toBeNull();
    // No trace to render, and that is not an error state either.
    expect(screen.getByText(/no grant was recorded/i)).toBeTruthy();
  });

  it('still renders a row whose target has been deleted', async () => {
    rows = [row({ target: { type: 'unit', id: 'abcdef12-0000-0000-0000-000000000000', name: null } })];
    mount();
    // NEVER hidden. A record that drops the rows whose subjects are gone is a record that
    // can be edited by deleting things.
    expect(await screen.findByText(/\(deleted\)/)).toBeTruthy();
  });

  it('puts the refusals-only toggle in the URL, so a filtered log is a link', async () => {
    mount();
    await screen.findByRole('button', { expanded: false });
    fireEvent.click(screen.getByLabelText(/show refusals only/i));

    // The whole reason the filters live in the URL: "here is the row I mean", pasted.
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
