// T-034 — /app/subjects/:id. 35 § Interactions.
//
// The history is the reason this page exists rather than a modal: "did anything actually
// change?" is the product's whole question, and cycles with response counts are the
// cheapest honest answer to it before the Improve loop lands in P3.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { Capability, SubjectCycle, SubjectDetail, UnitNode } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
import Detail, { trendOf } from './Detail.js';

const cycle = (over: Partial<SubjectCycle> & { campaignId: string; campaignName: string }): SubjectCycle => ({
  status: 'closed', startsAt: '2026-03-01T00:00:00.000Z', endsAt: null, closedAt: null,
  responseCount: 0, ...over,
});

const detail = (over: Partial<SubjectDetail> = {}): SubjectDetail => ({
  id: 's1', name: 'Data Structures', type: 'general',
  unitId: 'u1', unitName: 'Engineering',
  linkedUserId: null, linkedUserName: null,
  activeCampaigns: 1, totalResponses: 90, lastResponseAt: '2026-08-18T00:00:00.000Z',
  archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  cycles: [
    cycle({ campaignId: 'c1', campaignName: 'Spring cycle', responseCount: 60 }),
    cycle({ campaignId: 'c2', campaignName: 'Autumn cycle', responseCount: 30, status: 'open' }),
  ],
  ...over,
});

const units: UnitNode[] = [{
  id: 'u1', name: 'Engineering', parentId: null, isTemporary: false, endsAt: null,
  peopleCount: 0, subjectCount: 0, children: [],
}];

const update = vi.fn();
const archive = vi.fn();
const reload = vi.fn();
let subject: { data: SubjectDetail | null; loading: boolean; error: Error | null };

vi.mock('../../../lib/subjects.js', () => ({
  useSubject: () => ({ ...subject, reload }),
  useSubjectList: () => ({
    data: null, loading: false, error: null,
    reload, create: vi.fn(), rename: vi.fn(), update, archive,
  }),
  subjectSearch: () => '',
}));
vi.mock('../../../lib/units.js', () => ({
  useUnits: () => ({ data: units, loading: false, error: null }),
}));
vi.mock('../../../lib/people.js', () => ({
  usePeopleSearch: () => ({ data: null, loading: false, error: null }),
  usePeopleIn: () => ({ data: null, loading: false, error: null }),
}));

const ALL: Capability[] = ['subject.read', 'subject.update', 'subject.archive', 'person.read'];

const mount = (capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/subjects/:id" element={<Detail />} />
      <Route path="/app/subjects" element={<p>LIST</p>} />
    </Routes>,
    { capabilities, labels: NONSENSE_LABELS, path: '/app/subjects/s1' },
  );

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue(undefined);
  archive.mockResolvedValue(undefined);
  reload.mockResolvedValue(undefined);
  subject = { data: detail(), loading: false, error: null };
});

describe('trendOf — two cycles is enough to say more or fewer', () => {
  it('is absent with fewer than two answered cycles', () => {
    expect(trendOf([])).toBeUndefined();
    expect(trendOf([cycle({ campaignId: 'c1', campaignName: 'One', responseCount: 5 })])).toBeUndefined();
  });

  it('ignores cycles nobody answered — a draft is not a decline', () => {
    const cycles = [
      cycle({ campaignId: 'c1', campaignName: 'One', responseCount: 60 }),
      cycle({ campaignId: 'c2', campaignName: 'Two', responseCount: 0, status: 'draft' }),
      cycle({ campaignId: 'c3', campaignName: 'Three', responseCount: 75 }),
    ];
    expect(trendOf(cycles)).toEqual({ value: 15, valence: 'positive' });
  });

  it('calls a fall a fall', () => {
    expect(trendOf(detail().cycles)).toEqual({ value: -30, valence: 'negative' });
  });
});

describe('the page', () => {
  it('says what it is in the organisation vocabulary (INV-001)', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Data Structures' })).toBeTruthy();
    expect(screen.getByText('Quaxel · in Engineering')).toBeTruthy();
    expect(screen.getByText('Active Plithes')).toBeTruthy();
  });

  it('shows the history oldest first, with per-cycle counts', () => {
    const { container } = mount();
    // Scoped to the history list: the page header's vocabulary chips are list items too,
    // and an unscoped getAllByRole('listitem') picks those up first.
    const cycles = Array.from(container.querySelectorAll('.cycle'));
    expect(cycles).toHaveLength(2);
    expect(within(cycles[0] as HTMLElement).getByRole('link', { name: 'Spring cycle' })).toBeTruthy();
    expect(within(cycles[0] as HTMLElement).getByText('60')).toBeTruthy();
    expect(within(cycles[1] as HTMLElement).getByRole('link', { name: 'Autumn cycle' })).toBeTruthy();
    expect(within(cycles[1] as HTMLElement).getByText('30')).toBeTruthy();
  });

  it('says plainly when nothing has reviewed it yet', () => {
    subject = { data: detail({ cycles: [], totalResponses: 0, activeCampaigns: 0 }), loading: false, error: null };
    mount();
    expect(screen.getByText(/No plithes have included this quaxel yet/)).toBeTruthy();
  });

  it('edits through the same form as create, and can REMOVE a link', async () => {
    subject = {
      data: detail({ linkedUserId: 'p7', linkedUserName: 'Vikram Shah' }),
      loading: false, error: null,
    };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit Data Structures' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove link' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    // null, not undefined: undefined would leave the link in place, which is the bug this
    // assertion exists to catch.
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('s1', {
        name: 'Data Structures', unitId: 'u1', linkedUserId: null,
      }),
    );
  });

  it('archives with the sentence about what is kept, then leaves for the list', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('keeps its 90 responses');

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('LIST')).toBeTruthy();
  });

  it('offers no writes on an archived subject, and says it is archived', () => {
    subject = { data: detail({ archivedAt: '2026-07-01T00:00:00.000Z' }), loading: false, error: null };
    mount();

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.getByText(/stays out of new plithes/)).toBeTruthy();
  });

  it('offers no writes to a reader who may only read', () => {
    mount(['subject.read']);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
  });
});
