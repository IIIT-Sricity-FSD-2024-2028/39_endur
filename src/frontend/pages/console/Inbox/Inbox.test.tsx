import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Capability, InboxResponse, Page } from '@endur/shared';
import {
  NONSENSE_LABELS, errorReply, heldReply, renderWithProviders, stubApi, type StubCall,
} from '../../../test-utils.js';
import Inbox from './index.js';

const card = (over: Partial<InboxResponse> = {}): InboxResponse => ({
  id: 'resp-1',
  questionId: 'q-1',
  at: '2026-08-20T10:00:00.000Z',
  campaign: { id: 'c-1', name: 'Autumn round' },
  subject: { id: 's-1', name: 'Data Structures' },
  comment: 'The projector in Room 4 has never worked',
  questionText: 'Anything else you would like to tell us?',
  score: 2,
  scoreMax: 5,
  read: false,
  archived: false,
  ...over,
});

let queue: InboxResponse[];
let nextCursor: string | null;
let failMark: boolean;
let marks: string[];

const page = (data: InboxResponse[]): Page<InboxResponse> => ({
  data,
  page: { nextCursor, hasMore: nextCursor !== null },
  meta: { total: data.length },
});

function filtered(state: string): InboxResponse[] {
  switch (state) {
    case 'archived': return queue.filter((c) => c.archived);
    case 'read': return queue.filter((c) => c.read && !c.archived);
    case 'unread': return queue.filter((c) => !c.read && !c.archived);
    default: return queue.filter((c) => !c.archived);
  }
}

/** The stub server (R-501): the real hooks and the real cache run above it. */
let calls: StubCall[];
/** Set to hold every mark's answer back, to see what the page does before it arrives. */
let holdMarks: ReturnType<typeof heldReply> | null;

const inboxGets = (): string[] =>
  calls.filter((call) => call.method === 'GET' && call.path.startsWith('/inbox')).map((call) => call.path);

const server = () => stubApi({
  'GET /inbox*': (call) => {
    const search = new URLSearchParams(call.path.split('?')[1] ?? '');
    return { body: page(filtered(search.get('state') ?? 'unread')) };
  },
  'GET /campaigns*': { body: { data: [{ id: 'c-1', name: 'Autumn round' }], page: {}, meta: { total: 1 } } },
  'GET /subjects*': { body: { data: [{ id: 's-1', name: 'Data Structures' }], page: {}, meta: { total: 1 } } },
  'POST /inbox/*': (call) => {
    marks.push(call.path);
    if (holdMarks) return holdMarks.promise;
    return failMark ? errorReply(500, 'INTERNAL', 'The server said no.') : { status: 204 };
  },
});

const ALL: Capability[] = ['response.read', 'campaign.read', 'subject.read'];

const mount = (capabilities: Capability[] = ALL, path = '/app/inbox') =>
  renderWithProviders(<Inbox />, { capabilities, path, labels: NONSENSE_LABELS });

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  calls = server();
  holdMarks = null;
  queue = [card()];
  nextCursor = null;
  failMark = false;
  marks = [];
});

describe('the queue', () => {
  it('opens on UNREAD, not on everything — the queue is what is new', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(inboxGets()[0]).toContain('state=unread');
  });

  it('shows the score from the same response, with its scale and no colour class', async () => {
    mount();
    const badge = await screen.findByLabelText('Rated 2 out of 5');
    expect(badge.textContent).toBe('2/5');
    expect(badge.className).toBe('score-badge');
  });

  it('renders no analysis tag, because <ResponseCard> has no prop that could carry one', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(document.body.textContent).not.toMatch(/sentiment|negative|positive|topic|emotion/i);
  });

  it('expands to the question and the campaign, and marks read by doing so', async () => {
    mount();
    const comment = await screen.findByText(/projector in Room 4/);
    expect(screen.queryByText(/Anything else you would like/)).toBeNull();

    fireEvent.click(comment);
    await screen.findByText(/Anything else you would like/);
    expect(
      document.querySelector('.response-card-detail')?.textContent,
    ).toContain('Autumn round');
    await waitFor(() => expect(marks).toEqual(['/inbox/resp-1/read']));
  });

  it('DOES NOT EVICT THE CARD IT JUST OPENED — the bug the test above found', async () => {
    mount();
    fireEvent.click(await screen.findByText(/projector in Room 4/));
    await screen.findByText(/Anything else you would like/);
    expect(screen.getByText(/projector in Room 4/)).toBeTruthy();

    expect(screen.getByRole('tab', { name: /Unread/ }).textContent).toBe('Unread');

    fireEvent.click(screen.getByTitle('Mark unread (u)'));
    fireEvent.click(await screen.findByTitle('Mark read (u)'));
    await waitFor(() => expect(screen.queryByText(/projector in Room 4/)).toBeNull());
  });

  it('DOES NOT mark read on scroll — the only marks are the ones asked for', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.scroll(window, {});
    fireEvent.scroll(document.querySelector('.inbox-list') as Element, {});
    expect(marks).toEqual([]);
  });
});

describe('marking is optimistic and belongs to the reader', () => {
  it('moves the card out of Unread AT THE CLICK, before any response', async () => {
    queue = [card(), card({ id: 'resp-2', questionId: 'q-2', comment: 'Second comment' })];
    holdMarks = heldReply({ status: 204 });
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(screen.getAllByRole('article')).toHaveLength(2);

    fireEvent.click(screen.getAllByTitle('Mark read (u)')[0] as Element);

    // Gone while the server has still not answered (the reply is held).
    await waitFor(() => expect(screen.queryByText(/projector in Room 4/)).toBeNull());
    expect(marks).toEqual(['/inbox/resp-1/read']);
    expect(screen.getByText('Second comment')).toBeTruthy();
    holdMarks.release();
  });

  it('REVERTS THE ONE CARD and says so on it when the save fails', async () => {
    failMark = true;
    mount();
    await screen.findByText(/projector in Room 4/);

    fireEvent.click(screen.getByTitle('Mark read (u)'));
    await screen.findByText('The server said no.');
    expect(screen.getByText(/projector in Room 4/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('archives with no confirmation — it is reversible and affects only the caller', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.click(screen.getByTitle('Archive (e)'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(marks).toEqual(['/inbox/resp-1/archive']));
  });

  it('drops the unread count as the card leaves, rather than after a reload', async () => {
    queue = [card(), card({ id: 'resp-2', questionId: 'q-2', comment: 'Second comment' })];
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(screen.getByRole('tab', { name: /Unread/ }).textContent).toContain('2');

    fireEvent.click(screen.getAllByTitle('Archive (e)')[0] as Element);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Unread/ }).textContent).toContain('1'));
  });

  it('carries a count on Unread ALONE — a badge on Read is a number nobody acts on', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    for (const label of ['All', 'Read', 'Archived']) {
      expect(screen.getByRole('tab', { name: label }).textContent).toBe(label);
    }
  });
});

describe('j/k/e/u, and every one of them is also a button', () => {
  it('toggles read with `u`', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.keyDown(window, { key: 'u' });
    await waitFor(() => expect(marks).toEqual(['/inbox/resp-1/read']));
  });

  it('archives with `e`', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.keyDown(window, { key: 'e' });
    await waitFor(() => expect(marks).toEqual(['/inbox/resp-1/archive']));
  });

  it('moves the selection with j and k without marking anything', async () => {
    queue = [card(), card({ id: 'resp-2', questionId: 'q-2', comment: 'Second comment' })];
    mount();
    await screen.findByText(/projector in Room 4/);

    expect(screen.getAllByRole('article')[0]?.className).toContain('is-selected');
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getAllByRole('article')[1]?.className).toContain('is-selected');
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getAllByRole('article')[0]?.className).toContain('is-selected');
    expect(marks).toEqual([]);
  });

  it('NEVER steals a keystroke from a field being typed into', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    const select = screen.getAllByRole('combobox')[0] as HTMLElement;
    fireEvent.keyDown(select, { key: 'e' });
    fireEvent.keyDown(select, { key: 'u' });
    expect(marks).toEqual([]);
  });

  it('gives every shortcut a visible button — a queue is not two products', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(screen.getByTitle('Archive (e)')).toBeTruthy();
    expect(screen.getByTitle('Mark read (u)')).toBeTruthy();
    expect(screen.getByText('e').tagName).toBe('KBD');
  });
});

describe('three empties, because they mean three different things', () => {
  it('says "You\'re up to date" on an empty Unread — the one people see most', async () => {
    queue = [card({ read: true })];
    mount();
    await screen.findByText("You're up to date");
  });

  it('SUPPRESSED AND GENUINELY EMPTY ARE THE SAME SCREEN — 52 §2', async () => {
    queue = [];
    mount(ALL, '/app/inbox?state=all');
    await screen.findByText('No written feedback yet');
    expect(document.body.textContent).not.toMatch(/hidden|suppress|threshold|below/i);
  });

  it('offers to clear the filters, and names the org’s own noun in the link', async () => {
    queue = [];
    mount(ALL, '/app/inbox?state=all&campaignId=c-1');
    await screen.findByText('Nothing matches those filters');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByText('No written feedback yet');
    expect(screen.getByRole('link').textContent).toMatch(/plithes/i);
  });
});

describe('access', () => {
  it('renders a full-page refusal without response.read, not an empty queue', async () => {
    mount([]);
    await screen.findByText('You do not have access to this');
    expect(inboxGets()).toEqual([]);
  });

  it('keeps the tab, the filters and the cursor in the URL so a queue is linkable', async () => {
    mount(ALL, '/app/inbox?state=archived');
    await waitFor(() => expect(inboxGets()[0]).toContain('state=archived'));
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    await waitFor(() => expect(inboxGets().some((path) => path.includes('state=all'))).toBe(true));
  });
});
