// R-504: the console half of booking on RTK Query, over a stubbed `fetch`. (No page test
// covers these screens, so this is the only thing that runs them.)
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookableSummary, BookingSummary } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, stubApi, type StubCall } from '../test-utils.js';
import { openKey, useBookable, useBookableCommands, useBookables } from './booking.js';

const bookable = (id: string, booked = 10) =>
  ({ id, name: 'Office hours', booked } as unknown as BookableSummary);
const booking = (id: string) => ({ id, name: 'Amara' } as unknown as BookingSummary);

function render<T>(hook: () => T) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(hook, { wrapper });
}

const gets = (calls: StubCall[], path: string) =>
  calls.filter((call) => call.method === 'GET' && call.path === path).length;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useBookables', () => {
  it('a 403 is a refusal to render, not an error to retry', async () => {
    stubApi({ 'GET /bookables': errorReply(403, 'FORBIDDEN', 'No.') });
    const { result } = render(() => useBookables());
    await waitFor(() => expect(result.current.forbidden).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual([]);
  });

  it('a 402 is a DIFFERENT answer: it names something buyable (DEC-011)', async () => {
    stubApi({ 'GET /bookables': errorReply(402, 'PAYMENT_REQUIRED', 'Upgrade.') });
    const { result } = render(() => useBookables());
    await waitFor(() => expect(result.current.upgrade).toBe(true));
    expect(result.current.forbidden).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('asks nothing when it is not wanted', () => {
    const calls = stubApi({});
    const { result } = render(() => useBookables(false));
    expect(result.current.loading).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('useBookable and its commands', () => {
  it('saving the times re-reads the bookable and its bookings, with no Date reaching the store', async () => {
    const consoleError = vi.spyOn(console, 'error');
    let booked = 10;
    const calls = stubApi({
      'GET /bookables/b1': () => ({ body: { data: bookable('b1', booked) } }),
      'GET /bookables/b1/bookings': { body: { data: [booking('k1')] } },
      'PUT /bookables/b1/slots': () => {
        booked = 20;
        return { body: { data: bookable('b1', booked) } };
      },
    });
    const { result } = render(() => ({ view: useBookable('b1'), commands: useBookableCommands('b1') }));
    await waitFor(() => expect(result.current.view.bookable?.booked).toBe(10));
    expect(result.current.view.bookings).toHaveLength(1);

    const startsAt = new Date('2026-12-01T09:00:00.000Z');
    await act(async () => {
      await result.current.commands.putSlots({
        slots: [{ startsAt, endsAt: new Date('2026-12-01T10:00:00.000Z'), capacity: 20 }],
      });
    });

    await waitFor(() => expect(result.current.view.bookable?.booked).toBe(20));
    expect(gets(calls, '/bookables/b1/bookings')).toBe(2);
    expect((calls.find((call) => call.method === 'PUT')?.body as { slots: Array<{ startsAt: string }> }).slots[0]?.startsAt)
      .toBe('2026-12-01T09:00:00.000Z');
    // A mutation keeps no argument in the store, and RTK ignores `meta.arg` in actions.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('opening sends the bookable\'s own idempotency key: a double-click is one link', async () => {
    const calls = stubApi({
      'GET /bookables/b1': { body: { data: bookable('b1') } },
      'GET /bookables/b1/bookings': { body: { data: [] } },
      'POST /bookables/b1/open': { body: { data: bookable('b1') } },
    });
    const { result } = render(() => ({ view: useBookable('b1'), commands: useBookableCommands('b1') }));
    await waitFor(() => expect(result.current.view.bookable).not.toBeNull());

    await act(async () => { await result.current.commands.open(openKey('b1')); });

    expect(calls.find((call) => call.method === 'POST')?.headers.get('Idempotency-Key')).toBe('bookable-open-b1');
  });

  it('cancelling somebody\'s booking frees the place: the bookings are re-read', async () => {
    let taken = [booking('k1'), booking('k2')];
    stubApi({
      'GET /bookables/b1': { body: { data: bookable('b1') } },
      'GET /bookables/b1/bookings': () => ({ body: { data: taken } }),
      'POST /bookings/k1/cancel': () => {
        taken = [booking('k2')];
        return { status: 204 };
      },
    });
    const { result } = render(() => ({ view: useBookable('b1'), commands: useBookableCommands('b1') }));
    await waitFor(() => expect(result.current.view.bookings).toHaveLength(2));

    await act(async () => { await result.current.commands.cancelBooking('k1'); });

    await waitFor(() => expect(result.current.view.bookings.map((row) => row.id)).toEqual(['k2']));
  });

  it('a 403 on either read is the refusal state', async () => {
    stubApi({
      'GET /bookables/b1': errorReply(403, 'FORBIDDEN', 'No.'),
      'GET /bookables/b1/bookings': errorReply(403, 'FORBIDDEN', 'No.'),
    });
    const { result } = render(() => useBookable('b1'));
    await waitFor(() => expect(result.current.forbidden).toBe(true));
    expect(result.current.error).toBeNull();
  });
});
