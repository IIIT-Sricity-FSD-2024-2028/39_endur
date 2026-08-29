// T-094 — /app/announcements and <AnnouncementBanner>. 61, 24 § Announcements.
//
// The assertions that matter here are the two the feature is FOR:
//
//   · a drafter who cannot publish is not offered a Publish button — the seeded gap
//     between `announcement.create` and `announcement.publish` is the reason they are two
//     verbs, and a button the API would refuse hides it (INV-003 is still the server's).
//   · a published row prints a FRACTION, and a draft does not print zeros. "0 of 0" on
//     something sent to nobody reads as a broken feature rather than an unsent one.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { AnnouncementSummary, Capability } from '@endur/shared';
import { renderWithProviders, NONSENSE_LABELS } from '../../../test-utils.js';
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

const reload = vi.fn();
let rows: AnnouncementSummary[];
let forbidden: boolean;

vi.mock('../../../lib/announcements.js', () => ({
  useAnnouncements: () => ({
    data: rows,
    rows,
    loading: false,
    error: null,
    forbidden,
    reload,
  }),
  useRecipientPreview: () => 4,
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  publishAnnouncement: vi.fn(),
  publishKey: (id: string) => `key-${id}`,
  deleteAnnouncement: vi.fn(),
  markAnnouncementRead: vi.fn(),
}));

const mount = (capabilities: Capability[]) =>
  renderWithProviders(<Announcements />, {
    capabilities,
    labels: NONSENSE_LABELS,
    path: '/app/announcements',
  });

describe('/app/announcements', () => {
  beforeEach(() => {
    forbidden = false;
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

  it('prints the read fraction on a published row and not on a draft', () => {
    mount(['announcement.read']);
    expect(screen.getByText('12 of 40 have read this')).toBeTruthy();
    expect(screen.getByText('Draft — sent to nobody yet')).toBeTruthy();
  });

  it('offers Publish only to somebody who holds announcement.publish', () => {
    mount(['announcement.read', 'announcement.create']);
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('names the consequence before publishing, and does not publish on open', () => {
    mount(['announcement.read', 'announcement.create', 'announcement.publish']);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('frozen');
  });

  it('renders a 403 panel rather than an empty list', () => {
    forbidden = true;
    rows = [];
    mount([]);
    expect(screen.getByText('Not yours to read')).toBeTruthy();
  });

  it('offers no composer to a reader who cannot write', () => {
    mount(['announcement.read']);
    expect(screen.queryByRole('button', { name: /New announcement/ })).toBeNull();
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
