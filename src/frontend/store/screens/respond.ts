// A respondent's form in progress: the answers, which subject it is about, what is wrong
// with it, and whether it is on its way. docs/REDUX-PLAN.md §6.10 (R-704, DEC-R03).
//
// Kept per link TOKEN, because a member's Home can show several waiting forms at once and
// two open forms must never share an answer. The form itself (the questions) is server data
// and stays in the RTK Query cache (`getPublicCampaign`).
//
// The rules this keeps, from 39 § Validation and 07 §7.4:
// - nothing is marked invalid until Submit is pressed;
// - an error clears the instant its question is answered;
// - a failed send keeps every answer, and the button says how many are left;
// - one idempotency key per FILL, reused on every retry of that fill.
//
// In the respondent graph (bundle.test.ts): only this, `common.ts` and what the entry chunk
// already carries.
import { createAsyncThunk, createSlice, nanoid, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import type { AnswerValue, SubmitResponseBody } from '@endur/shared';
import { ApiError } from '../../lib/api.js';
import { forgetBooking, rememberBooking } from '../../lib/booking-public.js';
import { signedOut } from '../authSlice.js';
import { isSerializedApiError, toApiError } from '../api/errors.js';
import { respondApi } from '../api/endpoints/respond.js';
import { rootReducer, type AppDispatch, type RootState } from '../index.js';

export type Answers = Record<string, AnswerValue>;

export type FormFill = {
  answers: Answers;
  subjectId: string | null;
  /** Question id → the message under it. */
  invalid: Record<string, string>;
  subjectInvalid: string | null;
  /** The line above the button when the send itself failed. */
  failure: string | null;
  sending: boolean;
  /** Submit pressed at least once: from then on the button counts what is left. */
  pressed: boolean;
  /** This fill's idempotency key, made on the first press and kept for every retry. */
  key: string | null;
};

/** A booker on `/book/:token`: the slot they picked, who they are, and what came back. */
export type BookingFill = {
  slotId: string | null;
  name: string;
  email: string;
  sending: boolean;
  failure: string | null;
  /** What taking the slot returned on this visit: the cancel key and the time. */
  booked: { cancelToken: string; startsAt: string; endsAt: string } | null;
  /** Cancelled on this visit: the device's marker no longer counts either. */
  cancelled: boolean;
};

export type RespondState = {
  fills: Record<string, FormFill>;
  /** By bookable token. */
  bookings: Record<string, BookingFill>;
};

const initialState: RespondState = { fills: {}, bookings: {} };

export const BLANK_BOOKING: BookingFill = {
  slotId: null,
  name: '',
  email: '',
  sending: false,
  failure: null,
  booked: null,
  cancelled: false,
};

const bookingOf = (state: RespondState, token: string): BookingFill =>
  (state.bookings[token] ??= { ...BLANK_BOOKING });

export const TOO_SLOW = 'That slot just filled. Pick another one.';
export const BOOKING_FAILURE = 'That did not go through. Your details are still here — try again.';

const createRespondThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: string;
}>();

/** Re-reads the bookable, so its slots show what is left right now. */
const rereadBookable = async (dispatch: AppDispatch, token: string): Promise<void> => {
  await dispatch(
    respondApi.endpoints.getPublicBookable.initiate(token, { subscribe: false, forceRefetch: true }),
  );
};

/**
 * Takes the picked slot. On success the cancel key is kept on this device too, so "cancel
 * this" survives a reload (39 § State). On a 409 somebody was faster: the slots are re-read
 * and the pick is cleared, so the reader chooses from what is really left.
 */
export const slotTaken = createRespondThunk(
  'respond/slotTaken',
  async ({ token }: { token: string }, { getState, dispatch, rejectWithValue }) => {
    const fill = selectBooking(getState(), token);
    if (!fill.slotId) return rejectWithValue('Pick a time first.');
    try {
      const receipt = await dispatch(
        respondApi.endpoints.takeSlot.initiate({
          token,
          body: { slotId: fill.slotId, name: fill.name, email: fill.email },
          key: `book:${nanoid()}`,
        }),
      ).unwrap();
      rememberBooking(token, receipt.cancelToken);
      return { cancelToken: receipt.cancelToken, startsAt: receipt.startsAt, endsAt: receipt.endsAt };
    } catch (error) {
      await rereadBookable(dispatch, token);
      const status = isSerializedApiError(error) ? error.status : 0;
      return rejectWithValue(status === 409 ? TOO_SLOW : BOOKING_FAILURE);
    }
  },
  {
    condition: ({ token }, { getState }) => {
      const fill = selectBooking(getState(), token);
      return !fill.sending && fill.slotId !== null && fill.name.trim() !== '' && fill.email.trim() !== '';
    },
  },
);

/** Cancels this device's booking with its own key, then re-reads the slots. */
export const bookingCancelled = createRespondThunk(
  'respond/bookingCancelled',
  async ({ token, cancelToken }: { token: string; cancelToken: string }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(respondApi.endpoints.cancelOwnBooking.initiate(cancelToken)).unwrap();
      forgetBooking(token);
      await rereadBookable(dispatch, token);
      return { token };
    } catch {
      return rejectWithValue(BOOKING_FAILURE);
    }
  },
  { condition: ({ token }, { getState }) => !selectBooking(getState(), token).sending },
);

export const BLANK_FILL: FormFill = {
  answers: {},
  subjectId: null,
  invalid: {},
  subjectInvalid: null,
  failure: null,
  sending: false,
  pressed: false,
  key: null,
};

const fillOf = (state: RespondState, token: string): FormFill =>
  (state.fills[token] ??= { ...BLANK_FILL, answers: {}, invalid: {} });

export const GENERIC_FAILURE = 'That did not go through. Your answers are still here — try again.';

/** What a refused send means for the form: per-question errors, the subject's, or a line. */
export type SendRefusal = {
  invalid: Record<string, string>;
  subjectInvalid: string | null;
  failure: string | null;
};

/**
 * The server's refusal, read onto the form. Field paths name answers by their POSITION in
 * what was sent (`body.answers.2.value`), so `sentOrder` maps them back to questions.
 */
export function refusalOf(error: unknown, sentOrder: string[]): SendRefusal {
  const thrown = isSerializedApiError(error) ? toApiError(error) : error;
  const none = { invalid: {}, subjectInvalid: null };
  if (!(thrown instanceof ApiError)) return { ...none, failure: GENERIC_FAILURE };
  if (thrown.code === 'CONFLICT') {
    return { ...none, failure: 'Your answers were already recorded. There is nothing more to do.' };
  }
  if (thrown.status === 404) return { ...none, failure: 'This is no longer accepting answers.' };
  if (thrown.fields.length === 0) {
    return { ...none, failure: thrown.status >= 500 ? GENERIC_FAILURE : thrown.message };
  }

  const invalid: Record<string, string> = {};
  const rest: string[] = [];
  let subjectInvalid: string | null = null;
  for (const field of thrown.fields) {
    if (field.path === 'body.subjectId') {
      subjectInvalid = field.message;
      continue;
    }
    const index = /^body\.answers\.(\d+)\./.exec(field.path)?.[1];
    const id = index === undefined ? undefined : sentOrder[Number(index)];
    if (id === undefined) rest.push(field.message);
    else invalid[id] = field.message;
  }
  return { invalid, subjectInvalid, failure: rest.length > 0 ? rest.join(' ') : null };
}

/**
 * Sends a fill. The component validates first (`fillSubmitPressed`) and only sends a
 * complete form; `condition` stops a second press while the first is in flight.
 */
export const answersSubmitted = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: SendRefusal;
}>()(
  'respond/answersSubmitted',
  async (
    arg: { token: string; body: SubmitResponseBody; sentOrder: string[]; campaignId?: string },
    { getState, dispatch, rejectWithValue },
  ) => {
    const key = selectFill(getState(), arg.token).key ?? `submit:${arg.token}:${nanoid()}`;
    try {
      return await dispatch(
        respondApi.endpoints.submitAnswers.initiate({
          token: arg.token,
          body: arg.body,
          key,
          campaignId: arg.campaignId,
        }),
      ).unwrap();
    } catch (error) {
      return rejectWithValue(refusalOf(error, arg.sentOrder));
    }
  },
  { condition: ({ token }, { getState }) => !selectFill(getState(), token).sending },
);

export const respondSlice = createSlice({
  name: 'respond',
  initialState,
  reducers: {
    /** An answer given or changed. Its error, if it had one, goes at once. */
    answerGiven(state, action: PayloadAction<{ token: string; questionId: string; value: AnswerValue }>) {
      const fill = fillOf(state, action.payload.token);
      fill.answers[action.payload.questionId] = action.payload.value;
      delete fill.invalid[action.payload.questionId];
    },
    subjectChosen(state, action: PayloadAction<{ token: string; subjectId: string }>) {
      const fill = fillOf(state, action.payload.token);
      fill.subjectId = action.payload.subjectId;
      fill.subjectInvalid = null;
    },
    /**
     * Submit pressed. `gaps` are the required questions left unanswered, worked out by the
     * form from the questions it shows; this marks them, or clears every mark when there are
     * none. The fill's idempotency key is made here, once, in `prepare`.
     */
    fillSubmitPressed: {
      reducer(
        state,
        action: PayloadAction<{ token: string; gaps: string[]; noSubject: boolean; key: string }>,
      ) {
        const { token, gaps, noSubject, key } = action.payload;
        const fill = fillOf(state, token);
        fill.pressed = true;
        fill.failure = null;
        fill.invalid = Object.fromEntries(gaps.map((id) => [id, 'Pick an answer to continue.']));
        fill.subjectInvalid = noSubject ? 'Choose one to continue.' : null;
        fill.key ??= key;
      },
      prepare: (token: string, gaps: string[], noSubject: boolean) => ({
        payload: { token, gaps, noSubject, key: `submit:${token}:${nanoid()}` },
      }),
    },
    /** The form closed (the page left, the card folded): its answers go, as they used to. */
    fillLeft(state, action: PayloadAction<{ token: string }>) {
      delete state.fills[action.payload.token];
    },

    // ---- booking ----

    slotPicked(state, action: PayloadAction<{ token: string; slotId: string }>) {
      bookingOf(state, action.payload.token).slotId = action.payload.slotId;
    },
    bookerNameEdited(state, action: PayloadAction<{ token: string; name: string }>) {
      bookingOf(state, action.payload.token).name = action.payload.name;
    },
    bookerEmailEdited(state, action: PayloadAction<{ token: string; email: string }>) {
      bookingOf(state, action.payload.token).email = action.payload.email;
    },
    bookingPageLeft(state, action: PayloadAction<{ token: string }>) {
      delete state.bookings[action.payload.token];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(answersSubmitted.pending, (state, action) => {
        fillOf(state, action.meta.arg.token).sending = true;
      })
      .addCase(answersSubmitted.fulfilled, (state, action) => {
        fillOf(state, action.meta.arg.token).sending = false;
      })
      .addCase(answersSubmitted.rejected, (state, action) => {
        const fill = fillOf(state, action.meta.arg.token);
        fill.sending = false;
        const refusal = action.payload ?? { invalid: {}, subjectInvalid: null, failure: GENERIC_FAILURE };
        fill.invalid = refusal.invalid;
        fill.subjectInvalid = refusal.subjectInvalid;
        fill.failure = refusal.failure;
      })
      .addCase(slotTaken.pending, (state, action) => {
        const fill = bookingOf(state, action.meta.arg.token);
        fill.sending = true;
        fill.failure = null;
      })
      .addCase(slotTaken.fulfilled, (state, action) => {
        const fill = bookingOf(state, action.meta.arg.token);
        fill.sending = false;
        fill.booked = action.payload;
        fill.cancelled = false;
      })
      .addCase(slotTaken.rejected, (state, action) => {
        const fill = bookingOf(state, action.meta.arg.token);
        fill.sending = false;
        fill.failure = action.payload ?? BOOKING_FAILURE;
        fill.slotId = null;
      })
      .addCase(bookingCancelled.pending, (state, action) => {
        bookingOf(state, action.meta.arg.token).sending = true;
      })
      .addCase(bookingCancelled.fulfilled, (state, action) => {
        const fill = bookingOf(state, action.meta.arg.token);
        fill.sending = false;
        fill.booked = null;
        fill.cancelled = true;
      })
      .addCase(bookingCancelled.rejected, (state, action) => {
        const fill = bookingOf(state, action.meta.arg.token);
        fill.sending = false;
        fill.failure = action.payload ?? BOOKING_FAILURE;
      })
      .addCase(signedOut, () => initialState);
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof respondSlice> {}
}

const injected = respondSlice.injectInto(rootReducer);

export const {
  answerGiven,
  subjectChosen,
  fillSubmitPressed,
  fillLeft,
  slotPicked,
  bookerNameEdited,
  bookerEmailEdited,
  bookingPageLeft,
} = respondSlice.actions;

/** One form's fill; a form nothing has happened on yet reads as blank. */
export const selectFill = (state: RootState, token: string): FormFill =>
  injected.selectSlice(state).fills[token] ?? BLANK_FILL;

/** One bookable's booking in progress; one nothing has happened on yet reads as blank. */
export const selectBooking = (state: RootState, token: string): BookingFill =>
  injected.selectSlice(state).bookings[token] ?? BLANK_BOOKING;
