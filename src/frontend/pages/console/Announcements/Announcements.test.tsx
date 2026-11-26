// `/app/announcements` through the real store: the list is RTK Query, the composer, the
// confirmations and the writes are `state.announcements` (store/screens/announcements.ts),
// and `stubApi` is the server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AnnouncementSummary, Capability } from '@endur/shared';
import {
  errorReply, renderWithProviders, stubApi, NONSENSE_LABELS, type StubCall,
} from '../../../test-utils.js';
import { AnnouncementBanner, unreadFor } from '../../../components/org/AnnouncementBanner.js';
import Announcements, { readLine } from './index.js';

const row = (over: Partial<AnnouncementSummary> & { id: string }): AnnouncementSummary => ({
  title: 'Fire drill on Friday',
  body: 'Everybody out by the north stair.',
  audience: { kind: 'anyone' },
  publishedAt: null,
  createdAt: '2026-08-30T09:00:00.000Z',
  authorName: 'Priya',
  recipients: 0,
  read: 0,
  readByMe: null,
  ...over,
});

let rows: AnnouncementSummary[];
let forbidden: boolean;
let calls: StubCall[] = [];

const UNITS = [
  { id: 'un1', name: 'Engineering', parentId: null, isTemporary: false, endsAt: null, children: [] },
  { id: 'un2', name: 'Medicine', parentId: null, isTemporary: false, endsAt: null, children: [] },
];

const server = (overrides: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({
    'GET /announcements': () =>
      forbidden ? errorReply(403, 'FORBIDDEN', 'No.') : { body: { data: rows } },
    'GET /units': { body: { data: UNITS } },
    'POST /announcements/preview': (call) => ({
      body: { data: { recipients: (call.body as { audience: { kind: string } }).audience.kind === 'anyone' ? 40 : 4 } },
    }),
    'POST /announcements': (call) => ({ status: 201, body: { data: row({ id: 'new', ...(call.body as object) }) } }),
    'PATCH /announcements/a1': (call) => ({ body: { data: row({ id: 'a1', ...(call.body as object) }) } }),
    'POST /announcements/a1/publish': { body: { data: row({ id: 'a1', publishedAt: '2026-08-31T09:00:00.000Z' }) } },
    'DELETE /announcements/a1': { status: 204 },
    ...overrides,
  });
};

/** Mounted, with the list read. */
const mount = async (capabilities: Capability[]) => {
  const result = renderWithProviders(<Announcements />, {
    capabilities,
    labels: NONSENSE_LABELS,
    path: '/app/announcements',
  });
  await waitFor(() => expect(calls.some((call) => call.path === '/announcements')).toBe(true));
  await waitFor(() => expect(document.querySelector('.skeleton-row')).toBeNull());
  return result;
};

const ALL: Capability[] = [
  'announcement.read', 'announcement.create', 'announcement.publish', 'announcement.delete',
];

afterEach(() => vi.unstubAllGlobals());

describe('/app/announcements', () => {
  beforeEach(() => {
    forbidden = false;
    server();
    rows = [
      row({ id: 'a1' }),
      row({
        id: 'a2',
        title: 'Timetables are up',
        publishedAt: '2026-08-29T09:00:00.000Z',
        recipients: 40,
        read: 12,
        readByMe: false,
      }),
    ];
  });

  it('prints the read fraction on a published row and not on a draft', async () => {
    await mount(['announcement.read']);
    expect(screen.getByText('12 of 40 have read this')).toBeTruthy();
    expect(screen.getByText('Draft — sent to nobody yet')).toBeTruthy();
  });

  it('offers Publish only to somebody who holds announcement.publish', async () => {
    await mount(['announcement.read', 'announcement.create']);
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('names the consequence before publishing, and does not publish on open', async () => {
    await mount(['announcement.read', 'announcement.create', 'announcement.publish']);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('frozen');
    expect(calls.some((call) => call.path.endsWith('/publish'))).toBe(false);
  });

  it('publishes on confirm, once, with the announcement\'s own key', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publish' });
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() =>
      expect(calls.filter((call) => call.path === '/announcements/a1/publish')).toHaveLength(1));
    const publish = calls.find((call) => call.path === '/announcements/a1/publish');
    expect(publish?.headers.get('idempotency-key')).toBe('announcement-publish-a1');
    // The list is re-read through its tag, so the card turns Published by itself.
    await waitFor(() =>
      expect(calls.filter((call) => call.method === 'GET' && call.path === '/announcements')).toHaveLength(2));
  });

  it('says why when publishing is refused, and keeps the draft', async () => {
    server({ 'POST /announcements/a1/publish': errorReply(409, 'CONFLICT', 'Already published elsewhere.') });
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Publish' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Already published elsewhere.');
    expect(screen.getByText('Draft — sent to nobody yet')).toBeTruthy();
  });

  it('deletes a draft on confirm, and not before', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'DELETE' && call.path === '/announcements/a1')).toBe(true));
  });

  it('cancelling a confirmation does nothing', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('renders a 403 panel rather than an empty list', async () => {
    forbidden = true;
    rows = [];
    await mount([]);
    expect(screen.getByText('Not yours to read')).toBeTruthy();
  });

  it('offers no composer to a reader who cannot write', async () => {
    await mount(['announcement.read']);
    expect(screen.queryByRole('button', { name: /New announcement/ })).toBeNull();
  });
});

describe('the composer', () => {
  beforeEach(() => {
    forbidden = false;
    rows = [row({ id: 'a1' })];
    server();
  });

  const dialog = () => within(screen.getByRole('dialog'));

  it('saves a new draft with what was typed, trimmed, and closes', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: /New announcement/ }));
    const save = dialog().getByRole<HTMLButtonElement>('button', { name: 'Save draft' });
    expect(save.disabled).toBe(true);

    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: '  Lab closed  ' } });
    fireEvent.change(dialog().getByLabelText('What do you want to say?'), { target: { value: 'Until Monday.' } });
    fireEvent.click(save);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((call) => call.method === 'POST' && call.path === '/announcements')?.body).toEqual({
      title: 'Lab closed', body: 'Until Monday.', audience: { kind: 'anyone' },
    });
  });

  it('edits a draft in place, starting from its words', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(dialog().getByLabelText<HTMLInputElement>('Title').value).toBe('Fire drill on Friday');
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: 'Fire drill on Thursday' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({ title: 'Fire drill on Thursday' });
  });

  it('counts the audience on the server once it settles, and recounts when it changes', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: /New announcement/ }));
    expect(dialog().getByText('Counting…')).toBeTruthy();
    expect(await dialog().findByText('40 people will get this.')).toBeTruthy();

    fireEvent.click(dialog().getByRole('radio', { name: /Everyone in a/ }));
    expect(dialog().getByText('Counting…')).toBeTruthy();
    expect(await dialog().findByText('4 people will get this.')).toBeTruthy();
  });

  it('asks once for a rule changed several times in a row', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await mount(ALL);
      fireEvent.click(screen.getByRole('button', { name: /New announcement/ }));
      fireEvent.click(dialog().getByRole('radio', { name: /Everyone in a/ }));
      const select = dialog().getByRole<HTMLSelectElement>('combobox');
      await waitFor(() => expect(select.options).toHaveLength(2));
      fireEvent.change(select, { target: { value: 'un2' } });
      fireEvent.change(select, { target: { value: 'un1' } });
      fireEvent.change(select, { target: { value: 'un2' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      await dialog().findByText('4 people will get this.');
      const previews = calls.filter((call) => call.path === '/announcements/preview');
      expect(previews).toHaveLength(1);
      expect(previews[0]?.body).toEqual({ audience: { kind: 'unit', unitId: 'un2', includeSubtree: true } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the draft and says why when the plan refuses it, with a way to the plans', async () => {
    server({ 'POST /announcements': errorReply(402, 'PLAN_REQUIRED', 'Announcements need Silver.') });
    await mount([...ALL, 'billing.update']);
    fireEvent.click(screen.getByRole('button', { name: /New announcement/ }));
    fireEvent.change(dialog().getByLabelText('Title'), { target: { value: 'Lab closed' } });
    fireEvent.change(dialog().getByLabelText('What do you want to say?'), { target: { value: 'Until Monday.' } });
    fireEvent.click(dialog().getByRole('button', { name: 'Save draft' }));

    expect((await dialog().findByRole('alert')).textContent).toContain('Announcements need Silver.');
    expect(dialog().getByRole('link', { name: 'See the plans' })).toBeTruthy();
    expect(dialog().getByLabelText<HTMLInputElement>('Title').value).toBe('Lab closed');
  });

  it('offers "a unit" only once there is a unit to choose', async () => {
    server({ 'GET /units': { body: { data: [] } } });
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: /New announcement/ }));
    await waitFor(() => expect(calls.some((call) => call.path === '/units')).toBe(true));
    expect(dialog().getByRole<HTMLInputElement>('radio', { name: /Everyone in a/ }).disabled).toBe(true);
  });

  it('closes on Cancel without saving', async () => {
    await mount(ALL);
    fireEvent.click(screen.getByRole('button', { name: /New announcement/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/announcements')).toBe(false);
  });
});

describe('readLine', () => {
  it('says an audience resolved to nobody rather than showing 0 of 0', () => {
    expect(readLine(row({ id: 'a', publishedAt: '2026-08-29T09:00:00.000Z' }))).toContain(
      'reached nobody',
    );
  });
});

describe('<AnnouncementBanner>', () => {
  it('renders nothing at all when there is nothing unread', () => {
    const { container } = renderWithProviders(
      <AnnouncementBanner items={[]} onDismiss={vi.fn()} />,
      { capabilities: [], labels: NONSENSE_LABELS },
    );
    expect(container.querySelector('.home-prompts')).toBeNull();
  });

  it('skips a notice the reader is not a recipient of', () => {
    const mine = row({
      id: 'mine',
      publishedAt: '2026-08-29T09:00:00.000Z',
      readByMe: false,
    });
    const theirs = row({ id: 'theirs', publishedAt: '2026-08-29T09:00:00.000Z', readByMe: null });
    const readAlready = row({
      id: 'read',
      publishedAt: '2026-08-29T09:00:00.000Z',
      readByMe: true,
    });
    expect(unreadFor([mine, theirs, readAlready]).map((item) => item.id)).toEqual(['mine']);
  });

  it('caps what it shows, so the first screen after sign-in is not six banners', () => {
    const many = [1, 2, 3, 4].map((index) =>
      row({ id: `a${index}`, publishedAt: '2026-08-29T09:00:00.000Z', readByMe: false }),
    );
    expect(unreadFor(many)).toHaveLength(2);
  });

  it('dismisses the one that was pressed', () => {
    const onDismiss = vi.fn();
    renderWithProviders(
      <AnnouncementBanner
        items={[row({ id: 'a1', publishedAt: '2026-08-29T09:00:00.000Z', readByMe: false })]}
        onDismiss={onDismiss}
      />,
      { capabilities: [], labels: NONSENSE_LABELS },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledWith('a1');
  });
});
