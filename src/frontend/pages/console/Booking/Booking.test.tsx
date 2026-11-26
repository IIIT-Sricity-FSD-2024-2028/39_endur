// The booking console through the real store: the reads are RTK Query, every button is a
// thunk in store/screens/booking.ts, and `stubApi` is the server. Every button on both pages
// is pressed here at least once (DEC-R04).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import type { BookableSummary, BookingSummary, Capability } from '@endur/shared';
import { errorReply, renderWithProviders, stubApi, type StubCall } from '../../../test-utils.js';
import Booking from './index.js';
import BookingDetail from './Detail.js';

const SLOT = { id: 's1', startsAt: '2099-03-02T09:00:00.000Z', endsAt: '2099-03-02T09:30:00.000Z', capacity: 3, remaining: 3 };

const bookable = (over: Partial<BookableSummary> = {}): BookableSummary => ({
  id: 'b1',
  name: 'Office hours',
  description: null,
  subjectId: null,
  subjectName: null,
  publicToken: null,
  url: null,
  closedAt: null,
  createdAt: '2099-01-01T00:00:00.000Z',
  slots: [SLOT],
  booked: 0,
  ...over,
});

const AMARA: BookingSummary = {
  id: 'k1', slotId: 's1', startsAt: SLOT.startsAt, endsAt: SLOT.endsAt,
  name: 'Amara', email: 'amara@example.test', cancelledAt: null, createdAt: '2099-02-01T00:00:00.000Z',
};

let current: BookableSummary;
let bookings: BookingSummary[];
let calls: StubCall[] = [];

const server = (overrides: Parameters<typeof stubApi>[0] = {}) => {
  calls = stubApi({
    'GET /bookables': () => ({ body: { data: [current] } }),
    'GET /bookables/b1': () => ({ body: { data: current } }),
    'GET /bookables/b1/bookings': () => ({ body: { data: bookings } }),
    'POST /bookables': { status: 201, body: { data: bookable({ id: 'b2', name: 'Lab bench', slots: [] }) } },
    'GET /bookables/b2': { body: { data: bookable({ id: 'b2', name: 'Lab bench', slots: [] }) } },
    'GET /bookables/b2/bookings': { body: { data: [] } },
    'PATCH /bookables/b1': (call) => {
      current = { ...current, ...(call.body as Partial<BookableSummary>) };
      return { body: { data: current } };
    },
    'PUT /bookables/b1/slots': () => ({ body: { data: current } }),
    'POST /bookables/b1/open': () => {
      current = { ...current, publicToken: 'TOK1', url: 'https://app.endur.test/book/TOK1' };
      return { body: { data: current } };
    },
    'POST /bookables/b1/close': () => {
      current = { ...current, closedAt: '2099-02-02T00:00:00.000Z' };
      return { body: { data: current } };
    },
    'DELETE /bookables/b1': { status: 204 },
    'POST /bookings/k1/cancel': () => {
      bookings = [{ ...AMARA, cancelledAt: '2099-02-03T00:00:00.000Z' }];
      return { status: 204 };
    },
    ...overrides,
  });
};

const ALL: Capability[] = [
  'booking.read', 'booking.create', 'booking.update', 'booking.delete', 'booking.cancel',
];

const mount = (path: string, capabilities: Capability[] = ALL) =>
  renderWithProviders(
    <Routes>
      <Route path="/app/booking" element={<Booking />} />
      <Route path="/app/booking/:id" element={<BookingDetail />} />
    </Routes>,
    { capabilities, path },
  );

/** The detail page, once the bookable has been read. */
const open = async (capabilities: Capability[] = ALL) => {
  const result = mount('/app/booking/b1', capabilities);
  await screen.findByRole('heading', { name: 'Times' });
  return result;
};

const confirm = (verb: string) =>
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: verb }));
const sent = (method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

beforeEach(() => {
  current = bookable();
  bookings = [];
  server();
});
afterEach(() => vi.unstubAllGlobals());

describe('the list', () => {
  it('adds a bookable and opens it, to give it times', async () => {
    mount('/app/booking');
    await screen.findByText('Office hours');
    const add = screen.getByRole<HTMLButtonElement>('button', { name: 'Add' });
    expect(add.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('What can people book?'), { target: { value: '  Lab bench ' } });
    fireEvent.click(add);

    expect(await screen.findByRole('heading', { name: 'Lab bench' })).toBeTruthy();
    expect(sent('POST', '/bookables')[0]?.body).toEqual({ name: 'Lab bench' });
  });

  it('adds with Enter too, once', async () => {
    mount('/app/booking');
    const box = await screen.findByLabelText('What can people book?');
    fireEvent.change(box, { target: { value: 'Lab bench' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });
    await screen.findByRole('heading', { name: 'Lab bench' });
    expect(sent('POST', '/bookables')).toHaveLength(1);
  });

  it('keeps the name and says why when it could not be added', async () => {
    server({ 'POST /bookables': errorReply(422, 'VALIDATION_FAILED', 'That name is taken.') });
    mount('/app/booking');
    const box = await screen.findByLabelText('What can people book?');
    fireEvent.change(box, { target: { value: 'Lab bench' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('That name is taken.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('What can people book?').value).toBe('Lab bench');
  });

  it('a 402 is an offer of the plan, not an error', async () => {
    server({ 'GET /bookables': errorReply(402, 'PAYMENT_REQUIRED', 'Gold.') });
    mount('/app/booking', [...ALL, 'billing.update']);
    expect(await screen.findByText('Booking is part of Gold')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See the plan' })).toBeTruthy();
  });
});

describe('a bookable: its details', () => {
  it('renames it and gives it a description, then shows the server\'s copy', async () => {
    await open();
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save details' });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Office hours (Room 4)' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: ' Bring questions. ' } });
    fireEvent.click(save);

    expect(await screen.findByRole('heading', { name: 'Office hours (Room 4)' })).toBeTruthy();
    expect(sent('PATCH', '/bookables/b1')[0]?.body).toEqual({
      name: 'Office hours (Room 4)', description: 'Bring questions.',
    });
    await waitFor(() => expect(save.disabled).toBe(true));
  });

  it('discards an edit, back to what the server holds', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Office hours');
    expect(sent('PATCH', '/bookables/b1')).toHaveLength(0);
  });

  it('will not save a blank name', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save details' }).disabled).toBe(true);
  });
});

describe('a bookable: its times', () => {
  it('edits, adds and removes times, and sends the whole set on Save', async () => {
    await open();
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save times' });
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Places'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a time' }));
    expect(screen.getAllByLabelText('Starts')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]!);
    expect(screen.getAllByLabelText('Starts')).toHaveLength(1);
    // Unsaved times cannot be opened: the link would offer what the server does not have.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Open for booking' }).disabled).toBe(true);

    fireEvent.click(save);
    await waitFor(() => expect(sent('PUT', '/bookables/b1/slots')).toHaveLength(1));
    expect(sent('PUT', '/bookables/b1/slots')[0]?.body).toEqual({
      slots: [{ startsAt: SLOT.startsAt, endsAt: SLOT.endsAt, capacity: 5 }],
    });
    await waitFor(() => expect(save.disabled).toBe(true));
  });

  it('a new time starts on the hour after the last one ends', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add a time' }));
    const starts = screen.getAllByLabelText<HTMLInputElement>('Starts');
    const lastEnd = new Date(SLOT.endsAt);
    const expected = new Date(lastEnd.getTime() + 60 * 60 * 1000);
    expected.setMinutes(0, 0, 0);
    expect(new Date(starts[1]!.value).getTime()).toBe(expected.getTime());
  });

  it('says why a save was refused, and keeps the edit', async () => {
    server({ 'PUT /bookables/b1/slots': errorReply(422, 'VALIDATION_FAILED', 'A time ends before it starts.') });
    await open();
    fireEvent.change(screen.getByLabelText('Places'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));
    expect((await screen.findByRole('alert')).textContent).toContain('A time ends before it starts.');
    expect(screen.getByLabelText<HTMLInputElement>('Places').value).toBe('5');
  });

  it('locks the times once somebody has booked', async () => {
    bookings = [AMARA];
    await open();
    expect(screen.queryByRole('button', { name: 'Save times' })).toBeNull();
    expect(screen.getByText(/times are locked/)).toBeTruthy();
  });
});

describe('a bookable: opening, sharing, closing, deleting', () => {
  it('opens it with its own key, once, and then offers Share and Close', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Open for booking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open for booking' }));

    expect(await screen.findByRole('button', { name: 'Share' })).toBeTruthy();
    expect(sent('POST', '/bookables/b1/open')).toHaveLength(1);
    expect(sent('POST', '/bookables/b1/open')[0]?.headers.get('idempotency-key')).toBe('bookable-open-b1');

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const sheet = screen.getByRole('dialog', { name: 'Share Office hours' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Share Office hours' })).toBeNull();
  });

  it('closes on confirm only', async () => {
    current = bookable({ publicToken: 'TOK1', url: 'https://app.endur.test/book/TOK1' });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    confirm('Cancel');
    expect(sent('POST', '/bookables/b1/close')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    confirm('Close');
    await waitFor(() => expect(sent('POST', '/bookables/b1/close')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).toBeNull());
  });

  it('deletes on confirm and goes back to the list', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this' }));
    confirm('Delete');
    await waitFor(() => expect(sent('DELETE', '/bookables/b1')).toHaveLength(1));
    expect(await screen.findByRole('heading', { name: 'Booking' })).toBeTruthy();
  });

  it('stays, and says so, when the delete is refused', async () => {
    server({ 'DELETE /bookables/b1': errorReply(409, 'CONFLICT', 'Not now.') });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete this' }));
    confirm('Delete');
    expect((await screen.findByRole('alert')).textContent).toContain('Not now.');
    expect(screen.getByRole('heading', { name: 'Office hours' })).toBeTruthy();
  });
});

describe('a bookable: somebody\'s booking', () => {
  it('cancels it on confirm, and the table says Cancelled', async () => {
    bookings = [AMARA];
    await open();
    const row = (await screen.findByText('amara@example.test')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alertdialog').textContent).toContain("Cancel Amara's booking?");
    confirm('Cancel it');

    await waitFor(() => expect(sent('POST', '/bookings/k1/cancel')).toHaveLength(1));
    expect(await screen.findByText('Cancelled')).toBeTruthy();
  });

  it('offers no Cancel to somebody without booking.cancel', async () => {
    bookings = [AMARA];
    await open(['booking.read']);
    await screen.findByText('Amara');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    // Nor any editing: the details card and the slot editor are booking.update's.
    expect(screen.queryByRole('button', { name: 'Save details' })).toBeNull();
  });
});
