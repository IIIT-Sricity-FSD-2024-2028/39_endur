// The respond slice on its own: per-token fills, the press, and how a refusal lands on the
// form (docs/REDUX-PLAN.md §6.10). The form on screen is pages/respond/Fill.test.tsx.
import { describe, expect, it } from 'vitest';
import { signedOut } from '../authSlice.js';
import { serializeApiError } from '../api/errors.js';
import { ApiError } from '../../lib/api.js';
import {
  GENERIC_FAILURE,
  answerGiven,
  answersSubmitted,
  fillLeft,
  fillSubmitPressed,
  refusalOf,
  respondSlice,
  subjectChosen,
} from './respond.js';

const reduce = respondSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });
const rating = { kind: 'rating', n: 4 } as const;

describe('respond slice', () => {
  it('starts with no fills', () => {
    expect(initial).toEqual({ fills: {}, bookings: {} });
  });

  it('keeps each token\'s answers apart', () => {
    let state = reduce(initial, answerGiven({ token: 'A', questionId: 'q1', value: rating }));
    state = reduce(state, answerGiven({ token: 'B', questionId: 'q1', value: { kind: 'yesno', yes: false } }));
    expect(state.fills.A?.answers.q1).toEqual(rating);
    expect(state.fills.B?.answers.q1).toEqual({ kind: 'yesno', yes: false });
  });

  it('marks nothing until the press, then exactly the gaps', () => {
    let state = reduce(initial, answerGiven({ token: 'A', questionId: 'q1', value: rating }));
    expect(state.fills.A?.invalid).toEqual({});
    state = reduce(state, fillSubmitPressed('A', ['q2'], true));
    expect(state.fills.A).toMatchObject({
      pressed: true,
      invalid: { q2: 'Pick an answer to continue.' },
      subjectInvalid: 'Choose one to continue.',
    });
  });

  it('clears an error the instant its question is answered, or the subject chosen', () => {
    let state = reduce(initial, fillSubmitPressed('A', ['q1', 'q2'], true));
    state = reduce(state, answerGiven({ token: 'A', questionId: 'q1', value: rating }));
    state = reduce(state, subjectChosen({ token: 'A', subjectId: 's2' }));
    expect(state.fills.A?.invalid).toEqual({ q2: 'Pick an answer to continue.' });
    expect(state.fills.A).toMatchObject({ subjectId: 's2', subjectInvalid: null });
  });

  it('mints one key per fill and keeps it for every retry', () => {
    let state = reduce(initial, fillSubmitPressed('A', [], false));
    const first = state.fills.A?.key;
    expect(first).toMatch(/^submit:A:/);
    state = reduce(state, fillSubmitPressed('A', [], false));
    expect(state.fills.A?.key).toBe(first);
    // An OPEN link: everyone in the room holds the same token, so two fills are two keys.
    const other = reduce(initial, fillSubmitPressed('A', [], false));
    expect(other.fills.A?.key).not.toBe(first);
  });

  it('is sending while the thunk is in flight, and lands a refusal on the form', () => {
    const arg = { token: 'A', body: { answers: [], channel: 'link' as const }, sentOrder: ['q1', 'q2'] };
    let state = reduce(initial, answersSubmitted.pending('r1', arg));
    expect(state.fills.A?.sending).toBe(true);
    state = reduce(
      state,
      answersSubmitted.rejected(null, 'r1', arg, { invalid: { q2: 'No' }, subjectInvalid: null, failure: null }),
    );
    expect(state.fills.A).toMatchObject({ sending: false, invalid: { q2: 'No' } });
    state = reduce(state, answersSubmitted.fulfilled({ responseCount: 1 }, 'r2', arg));
    expect(state.fills.A?.sending).toBe(false);
  });

  it('forgets a fill when its form closes, and every fill when the session ends', () => {
    const state = reduce(initial, answerGiven({ token: 'A', questionId: 'q1', value: rating }));
    expect(reduce(state, fillLeft({ token: 'A' })).fills.A).toBeUndefined();
    expect(reduce(state, signedOut())).toEqual(initial);
  });
});

describe('refusalOf: the server\'s refusal, read onto the form', () => {
  const api = (status: number, code: string, details?: Record<string, unknown>) =>
    serializeApiError(new ApiError({ status, code: code as never, requestId: 'r', message: 'server says', ...(details ? { details } : {}) }));

  it('puts a 422 under the question it names, by position in what was sent', () => {
    const refusal = refusalOf(
      api(422, 'VALIDATION_FAILED', {
        fields: [
          { path: 'body.answers.1.value', message: 'Does not match' },
          { path: 'body.subjectId', message: 'Not this one' },
          { path: 'body.other', message: 'Something else' },
        ],
      }),
      ['q1', 'q2'],
    );
    expect(refusal).toEqual({
      invalid: { q2: 'Does not match' }, subjectInvalid: 'Not this one', failure: 'Something else',
    });
  });

  it('says it was already recorded on a 409, and closed on a 404', () => {
    expect(refusalOf(api(409, 'CONFLICT'), []).failure).toMatch(/already recorded/);
    expect(refusalOf(api(404, 'NOT_FOUND'), []).failure).toMatch(/no longer accepting/);
  });

  it('keeps the answers and asks for another try when there was no answer at all', () => {
    expect(refusalOf(serializeApiError(new Error('offline')), []).failure).toBe(GENERIC_FAILURE);
    expect(refusalOf(api(500, 'INTERNAL'), []).failure).toBe(GENERIC_FAILURE);
  });
});

describe('booking on /book/:token', () => {
  it('records the pick and the booker per bookable', async () => {
    const { slotPicked, bookerNameEdited, bookerEmailEdited, bookingPageLeft } = await import('./respond.js');
    let state = reduce(initial, slotPicked({ token: 'B1', slotId: 's1' }));
    state = reduce(state, bookerNameEdited({ token: 'B1', name: 'Asha' }));
    state = reduce(state, bookerEmailEdited({ token: 'B1', email: 'a@x.test' }));
    expect(state.bookings.B1).toMatchObject({ slotId: 's1', name: 'Asha', email: 'a@x.test' });
    expect(reduce(state, bookingPageLeft({ token: 'B1' })).bookings.B1).toBeUndefined();
  });

  it('keeps the receipt when a slot is taken, and clears the pick when one is lost', async () => {
    const { slotPicked, slotTaken, TOO_SLOW } = await import('./respond.js');
    let state = reduce(initial, slotPicked({ token: 'B1', slotId: 's1' }));
    state = reduce(state, slotTaken.pending('r1', { token: 'B1' }));
    expect(state.bookings.B1?.sending).toBe(true);
    const lost = reduce(state, slotTaken.rejected(null, 'r1', { token: 'B1' }, TOO_SLOW));
    expect(lost.bookings.B1).toMatchObject({ sending: false, failure: TOO_SLOW, slotId: null });
    const receipt = { cancelToken: 'c1', startsAt: '2099-01-01T09:00:00Z', endsAt: '2099-01-01T09:30:00Z' };
    const kept = reduce(state, slotTaken.fulfilled(receipt, 'r1', { token: 'B1' }));
    expect(kept.bookings.B1).toMatchObject({ sending: false, booked: receipt, cancelled: false });
  });

  it('forgets the booking once cancelled, so the device marker no longer counts', async () => {
    const { bookingCancelled } = await import('./respond.js');
    const arg = { token: 'B1', cancelToken: 'c1' };
    const state = reduce(initial, bookingCancelled.fulfilled({ token: 'B1' }, 'r1', arg));
    expect(state.bookings.B1).toMatchObject({ booked: null, cancelled: true });
  });
});
