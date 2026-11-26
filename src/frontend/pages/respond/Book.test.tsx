// `/book/:token`, the public booking page, end to end through the real store and API layer:
// the read is RTK Query, taking and cancelling a slot are thunks (store/screens/respond.ts),
// and `stubApi` stands in for the server. docs/REDUX-PLAN.md §6.10 (R-704).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicBookable } from '@endur/shared';
import { errorReply, makeStore, stubApi, type StubCall } from '../../test-utils.js';
import Book from './Book.js';

const SLOT = (id: string, remaining = 3) => ({
  id,
  startsAt: '2099-03-02T09:00:00.000Z',
  endsAt: '2099-03-02T09:30:00.000Z',
  remaining,
});

const BOOKABLE: PublicBookable = {
  name: 'Office hours',
  description: 'Bring your questions.',
  orgName: 'Northfield',
  slots: [SLOT('s1'), SLOT('s2', 0)],
};

const RECEIPT = { cancelToken: 'cancel-1', startsAt: SLOT('s1').startsAt, endsAt: SLOT('s1').endsAt };
let calls: StubCall[] = [];

const mount = () =>
  render(
    <Provider store={makeStore({ signedOut: true })}>
      <MemoryRouter initialEntries={['/book/TOK1']}>
        <Routes>
          <Route path="/book/:token" element={<Book />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

const fillIn = async (): Promise<void> => {
  const slot = await screen.findByRole('button', { name: /3 left/ });
  fireEvent.click(slot);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Asha' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.test' } });
};

const bookButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /Book this time|Booking…/ });

beforeEach(() => {
  localStorage.clear();
  calls = stubApi({
    'GET /public/bookables/TOK1': { body: { data: BOOKABLE } },
    'POST /public/bookables/TOK1/bookings': { status: 201, body: { data: RECEIPT } },
    'POST /public/bookings/cancel-1/cancel': { status: 204 },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('booking a time', () => {
  it('offers the open slots, and books once a slot, a name and an email are given', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Office hours' })).toBeTruthy();
    // A full slot cannot be picked.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Full|0 left|no places/i }).disabled).toBe(true);
    expect(bookButton().disabled).toBe(true);

    await fillIn();
    expect(bookButton().disabled).toBe(false);
    fireEvent.click(bookButton());

    expect(await screen.findByRole('heading', { name: "You're booked." })).toBeTruthy();
    const take = calls.find((call) => call.method === 'POST' && call.path.endsWith('/bookings'));
    expect(take?.body).toEqual({ slotId: 's1', name: 'Asha', email: 'asha@example.test' });
    expect(take?.headers.get('idempotency-key')).toMatch(/^book:/);
    // The cancel key is kept on this device, so "cancel this" survives a reload.
    expect(localStorage.getItem('endur.booked.TOK1')).toBe('cancel-1');
  });

  it('a double press books once', async () => {
    mount();
    await fillIn();
    fireEvent.click(bookButton());
    fireEvent.click(bookButton());
    await screen.findByRole('heading', { name: "You're booked." });
    expect(calls.filter((call) => call.path.endsWith('/bookings'))).toHaveLength(1);
  });

  it('says somebody was faster, re-reads the slots and clears the pick', async () => {
    stubApi({
      'GET /public/bookables/TOK1': { body: { data: BOOKABLE } },
      'POST /public/bookables/TOK1/bookings': errorReply(409, 'CONFLICT', 'Full.'),
    });
    mount();
    await fillIn();
    fireEvent.click(bookButton());

    expect((await screen.findByRole('alert')).textContent).toBe('That slot just filled. Pick another one.');
    // The details stay; the pick goes, so the next one is chosen from what is really left.
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Asha');
    expect(bookButton().disabled).toBe(true);
  });
});

describe('cancelling', () => {
  it('cancels with the device\'s own key and offers the times again', async () => {
    mount();
    await fillIn();
    fireEvent.click(bookButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this booking' }));

    expect(await screen.findByRole('heading', { name: 'Pick a time' })).toBeTruthy();
    expect(calls.some((call) => call.path === '/public/bookings/cancel-1/cancel')).toBe(true);
    expect(localStorage.getItem('endur.booked.TOK1')).toBeNull();
  });

  it('remembers a booking made on an earlier visit', async () => {
    localStorage.setItem('endur.booked.TOK1', 'cancel-1');
    mount();
    expect(await screen.findByRole('heading', { name: "You're booked." })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel this booking' }));
    expect(await screen.findByRole('heading', { name: 'Pick a time' })).toBeTruthy();
  });
});

describe('a link that does not work', () => {
  it('says so, without saying why (the uniform 404)', async () => {
    stubApi({ 'GET /public/bookables/TOK1': errorReply(404, 'NOT_FOUND', 'x') });
    mount();
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Office hours' })).toBeNull();
  });
});
