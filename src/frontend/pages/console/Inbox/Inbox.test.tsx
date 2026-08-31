// T-080 — /app/inbox. 58 § Acceptance.
//
// MOCKS `lib/api.js`, not `lib/inbox.js`. The interesting logic on this screen is the hook:
// the optimistic mark, the revert, and which tab a card belongs in after it. Mocking the
// hook away would leave these tests asserting that a list renders, which was never the risk.
//
// The suppression cases are asserted from THE PAGE'S SIDE only. Whether a below-threshold
// campaign contributes rows is a server question and inbox.test.ts owns it — what matters
// here is that the page has nothing that could render a "3 hidden" placeholder even if it
// wanted to, which is why the empty screens below are the SAME screen.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Capability, InboxResponse, Page } from '@endur/shared';
import { NONSENSE_LABELS, renderWithProviders } from '../../../test-utils.js';
import Inbox from './index.js';

/** NONSENSE_LABELS renames `subject` to "Quaxel" and `campaign` to "Plithe". */
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

/** The server's own tab filter, mirrored — so the test exercises the real round trip. */
function filtered(state: string): InboxResponse[] {
  switch (state) {
    case 'archived': return queue.filter((c) => c.archived);
    case 'read': return queue.filter((c) => c.read && !c.archived);
    case 'unread': return queue.filter((c) => !c.read && !c.archived);
    default: return queue.filter((c) => !c.archived);
  }
}

const apiGet = vi.fn((path: string) => {
  if (path.startsWith('/inbox')) {
    const search = new URLSearchParams(path.split('?')[1] ?? '');
    return page(filtered(search.get('state') ?? 'unread'));
  }
  if (path.startsWith('/campaigns')) {
    return { data: [{ id: 'c-1', name: 'Autumn round' }], page: {}, meta: { total: 1 } };
  }
  if (path.startsWith('/subjects')) {
    return { data: [{ id: 's-1', name: 'Data Structures' }], page: {}, meta: { total: 1 } };
  }
  throw new Error(`unmocked GET ${path}`);
});

// vi.hoisted, because the mock factory is hoisted above every top-level binding and the
// hook's revert path does `error instanceof ApiError`. A plain Error would take the generic
// branch and the test would assert the fallback copy instead of the server's own words.
const hoisted = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});

const apiPost = vi.fn((path: string) => {
  marks.push(path);
  if (failMark) throw new hoisted.ApiError(500, 'The server said no.');
  return { data: null };
});

vi.mock('../../../lib/api.js', () => ({
  apiGet: (p: string) => apiGet(p),
  apiPost: (p: string) => apiPost(p),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  ApiError: hoisted.ApiError,
}));

const ALL: Capability[] = ['response.read', 'campaign.read', 'subject.read'];

const mount = (capabilities: Capability[] = ALL, path = '/app/inbox') =>
  renderWithProviders(<Inbox />, { capabilities, path, labels: NONSENSE_LABELS });

beforeEach(() => {
  vi.clearAllMocks();
  queue = [card()];
  nextCursor = null;
  failMark = false;
  marks = [];
});

/* ------------------------------------------------------------- the queue */

describe('the queue', () => {
  it('opens on UNREAD, not on everything — the queue is what is new', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(apiGet.mock.calls.map(([p]) => p).find((p) => p.startsWith('/inbox'))).toContain(
      'state=unread',
    );
  });

  it('shows the score from the same response, with its scale and no colour class', async () => {
    mount();
    const badge = await screen.findByLabelText('Rated 2 out of 5');
    expect(badge.textContent).toBe('2/5');
    // CONF-022: one surface at every value. A `is-bad`/`is-good` class here would be the
    // client deciding a 2 is bad, which is the interpretation CONF-016 refused.
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
    // Scoped to the detail block: the campaign name is also an <option> in the filter.
    expect(
      document.querySelector('.response-card-detail')?.textContent,
    ).toContain('Autumn round');
    expect(marks).toEqual(['/inbox/resp-1/read']);
  });

  it('DOES NOT EVICT THE CARD IT JUST OPENED — the bug the test above found', async () => {
    // On the Unread tab, opening a card marks it read, and the first version then filtered
    // it straight out of the list: the detail appeared and vanished in the same frame.
    // Reading is not triaging. The card leaves when the reader ticks or archives it.
    mount();
    fireEvent.click(await screen.findByText(/projector in Room 4/));
    await screen.findByText(/Anything else you would like/);
    expect(screen.getByText(/projector in Room 4/)).toBeTruthy();

    // The COUNT still drops, because it is a count of unread and one just stopped being.
    expect(screen.getByRole('tab', { name: /Unread/ }).textContent).toBe('Unread');

    // And the explicit tick does evict, which is the whole distinction.
    fireEvent.click(screen.getByTitle('Mark unread (u)'));
    fireEvent.click(screen.getByTitle('Mark read (u)'));
    expect(screen.queryByText(/projector in Room 4/)).toBeNull();
  });

  it('DOES NOT mark read on scroll — the only marks are the ones asked for', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.scroll(window, {});
    fireEvent.scroll(document.querySelector('.inbox-list') as Element, {});
    expect(marks).toEqual([]);
  });
});

/* ----------------------------------------------------- optimistic marking */

describe('marking is optimistic and belongs to the reader', () => {
  it('moves the card out of Unread AT THE CLICK, before any response', async () => {
    queue = [card(), card({ id: 'resp-2', questionId: 'q-2', comment: 'Second comment' })];
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(screen.getAllByRole('article')).toHaveLength(2);

    fireEvent.click(screen.getAllByTitle('Mark read (u)')[0] as Element);

    // Gone from the tab immediately — no await, no reload. A queue that renumbers itself
    // after a round trip loses the reader's place.
    expect(screen.queryByText(/projector in Room 4/)).toBeNull();
    expect(screen.getByText('Second comment')).toBeTruthy();
  });

  it('REVERTS THE ONE CARD and says so on it when the save fails', async () => {
    failMark = true;
    mount();
    await screen.findByText(/projector in Room 4/);

    fireEvent.click(screen.getByTitle('Mark read (u)'));
    // Back, with the failure inline ON the card — never a toast, which is the wrong
    // affordance for a per-card failure in a list of four hundred (58 § States).
    await screen.findByText('The server said no.');
    expect(screen.getByText(/projector in Room 4/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('archives with no confirmation — it is reversible and affects only the caller', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.click(screen.getByTitle('Archive (e)'));
    // <ConfirmDialog> requires a `consequence` prop (24 §6) and this action has none
    // worth writing.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(marks).toEqual(['/inbox/resp-1/archive']);
  });

  it('drops the unread count as the card leaves, rather than after a reload', async () => {
    queue = [card(), card({ id: 'resp-2', questionId: 'q-2', comment: 'Second comment' })];
    mount();
    await screen.findByText(/projector in Room 4/);
    expect(screen.getByRole('tab', { name: /Unread/ }).textContent).toContain('2');

    fireEvent.click(screen.getAllByTitle('Archive (e)')[0] as Element);
    expect(screen.getByRole('tab', { name: /Unread/ }).textContent).toContain('1');
  });

  it('carries a count on Unread ALONE — a badge on Read is a number nobody acts on', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    for (const label of ['All', 'Read', 'Archived']) {
      expect(screen.getByRole('tab', { name: label }).textContent).toBe(label);
    }
  });
});

/* ------------------------------------------------------------- keyboard */

describe('j/k/e/u, and every one of them is also a button', () => {
  it('toggles read with `u`', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.keyDown(window, { key: 'u' });
    expect(marks).toEqual(['/inbox/resp-1/read']);
  });

  it('archives with `e`', async () => {
    mount();
    await screen.findByText(/projector in Room 4/);
    fireEvent.keyDown(window, { key: 'e' });
    expect(marks).toEqual(['/inbox/resp-1/archive']);
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
    // Moving is not triaging.
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
    // And says so on the page rather than hiding it (58 § Interactions).
    expect(screen.getByText('e').tagName).toBe('KBD');
  });
});

/* ------------------------------------------------------------- the empties */

describe('three empties, because they mean three different things', () => {
  it('says "You\'re up to date" on an empty Unread — the one people see most', async () => {
    queue = [card({ read: true })];
    mount();
    await screen.findByText("You're up to date");
  });

  it('SUPPRESSED AND GENUINELY EMPTY ARE THE SAME SCREEN — 52 §2', async () => {
    // The server sends nothing in both cases, and there is nothing on this page that could
    // tell them apart or render a count of what it was not sent.
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
    // INV-001: NONSENSE_LABELS renames `campaign`, so an English noun here is a bug.
    expect(screen.getByRole('link').textContent).toMatch(/plithes/i);
  });
});

/* ---------------------------------------------------------------- access */

describe('access', () => {
  it('renders a full-page refusal without response.read, not an empty queue', async () => {
    mount([]);
    await screen.findByText('You do not have access to this');
    // And asks for nothing it may not have.
    expect(apiGet.mock.calls.map(([p]) => p).some((p) => p.startsWith('/inbox'))).toBe(false);
  });

  it('keeps the tab, the filters and the cursor in the URL so a queue is linkable', async () => {
    mount(ALL, '/app/inbox?state=archived');
    await waitFor(() => {
      expect(
        apiGet.mock.calls.map(([p]) => p).find((p) => p.startsWith('/inbox')),
      ).toContain('state=archived');
    });
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    await waitFor(() => {
      expect(
        apiGet.mock.calls.map(([p]) => p).some((p) => p.includes('state=all')),
      ).toBe(true);
    });
  });
});
