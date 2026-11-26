// The Plan page's state: which checkout is open, the Enterprise ask, and every plan write in
// flight. docs/REDUX-PLAN.md §6.10 (R-710, DEC-R03). The summary itself is the cache's
// (`getBilling`): every write answers with the whole summary and `billingApi` puts it
// straight into that one entry, so the page and the shell's plan banner move together.
//
// Trace for "Upgrade to Gold":
//   PlanPicker's button → `planChosen('gold')` (below) → `checkoutOpened` → the page renders
//   <PaymentDialog> from `paying` → "Pay" → `tierJoined` → `billingApi.joinTier` → the
//   summary in the cache is replaced → `tierJoined.fulfilled` here, and a toast.
import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';
import {
  PLAN_OPTIONS,
  joinPricedFrom,
  tierRank,
  type BillingSummary,
  type PlanOption,
  type Tier,
} from '@endur/shared';
import { formatDate } from '../../lib/format.js';
import { signedOut } from '../authSlice.js';
import { toastShown } from '../uiSlice.js';
import { billingApi } from '../api/endpoints/billing.js';
import { rootReducer, type AppDispatch, type RootState } from '../index.js';
import { asStoreError, createScreenThunk, type SerializedApiError } from './common.js';

/** Which write failed, so the page can say it in that write's words. */
export type PlanWrite = 'join' | 'schedule' | 'ask';

export const PLAN_FAILED: Record<PlanWrite, string> = {
  join: 'Could not change the plan.',
  schedule: 'Could not schedule that move.',
  ask: 'Could not send that request.',
};

export type PlanScreenState = {
  /**
   * The checkout: the tier, and what it is priced from, fixed when it opens. Fixed rather
   * than read from the summary on each render, because a successful join replaces the
   * summary while the success screen is still up, and the amount on it must not change
   * underneath the customer.
   */
  paying: { tier: Tier; pricedFrom: Tier | null } | null;
  /** The tier being joined, for the picker's spinner. */
  busyTier: Tier | null;
  /** A move down being scheduled or cancelled. */
  scheduling: boolean;
  /** The Enterprise ask: open, what is typed, and whether it is on its way. */
  asking: boolean;
  askNote: string;
  askSending: boolean;
  failure: { during: PlanWrite; error: SerializedApiError } | null;
};

const initialState: PlanScreenState = {
  paying: null,
  busyTier: null,
  scheduling: false,
  asking: false,
  askNote: '',
  askSending: false,
  failure: null,
};

/** The catalogue as the page shows it: the server's, or the shared list until it arrives. */
export const selectCatalogue = (state: RootState): readonly PlanOption[] =>
  billingApi.endpoints.getPlans.select()(state).data ?? PLAN_OPTIONS;

const nameOf = (state: RootState, tier: Tier | null): string | undefined =>
  selectCatalogue(state).find((plan) => plan.tier === tier)?.name;

/**
 * A plan card's button. Enterprise is asked for, never bought (DEC-100); anything else opens
 * the checkout, priced from the current tier unless a lapse means it is the full amount
 * (DEC-113). A tier at or below the current one is not joinable once paid for (DEC-098 moves
 * down are scheduled instead), so it does nothing.
 */
export const planChosen =
  (tier: Tier) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState();
    const summary = billingApi.endpoints.getBilling.select()(state).data;
    if (!summary) return;
    const plan = selectCatalogue(state).find((option) => option.tier === tier);
    if (plan && !plan.selectable) {
      dispatch(enterpriseAskOpened());
      return;
    }
    if (summary.status !== 'trialing' && tierRank(tier) <= tierRank(summary.tier)) return;
    dispatch(checkoutOpened({ tier, pricedFrom: joinPricedFrom(summary) }));
  };

/**
 * Join a tier, once the checkout has taken payment. <PaymentDialog> waits for this before it
 * says "Payment successful", so a join the server refuses never reaches that screen; on a
 * refusal the checkout closes and the page says why.
 */
export const tierJoined = createScreenThunk(
  'plan/tierJoined',
  async (
    { tier, paymentRef }: { tier: Tier; paymentRef: string },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const updated = await dispatch(
        billingApi.endpoints.joinTier.initiate({ tier, paymentRef }),
      ).unwrap();
      const name = nameOf(getState(), tier) ?? tier;
      dispatch(toastShown({ message: `You are on ${name}. It applies from your next action.` }));
      return updated;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => selectPlan(getState()).busyTier === null },
);

/** After a schedule or a cancel, the summary says which it was: one sentence for each. */
const scheduledMessage = (state: RootState, updated: BillingSummary): string => {
  const name = nameOf(state, updated.pendingTier);
  return name
    ? `${name} is scheduled for ${formatDate(updated.periodEnd)}. Nothing is charged today.`
    : 'That move is cancelled. Your plan stays as it is.';
};

/** DEC-098: a move down waits for the end of the period. Nothing is charged. */
export const downgradeScheduled = createScreenThunk(
  'plan/downgradeScheduled',
  async (tier: Tier, { dispatch, getState, rejectWithValue }) => {
    try {
      const updated = await dispatch(billingApi.endpoints.scheduleDowngrade.initiate(tier)).unwrap();
      dispatch(toastShown({ message: scheduledMessage(getState(), updated) }));
      return updated;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectPlan(getState()).scheduling },
);

/** The scheduled move's "Cancel". There is only ever one, so nothing is named. */
export const downgradeCancelled = createScreenThunk(
  'plan/downgradeCancelled',
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    try {
      const updated = await dispatch(billingApi.endpoints.cancelDowngrade.initiate()).unwrap();
      dispatch(toastShown({ message: scheduledMessage(getState(), updated) }));
      return updated;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectPlan(getState()).scheduling },
);

/**
 * "Send request" in the Enterprise dialog: the note typed there. `billingApi` upserts the
 * answer, so the card reads "Requested" at once (DEC-100).
 */
export const enterpriseRequested = createScreenThunk(
  'plan/enterpriseRequested',
  async (_: void, { dispatch, getState, rejectWithValue }) => {
    try {
      await dispatch(
        billingApi.endpoints.requestEnterprise.initiate(selectPlan(getState()).askNote),
      ).unwrap();
      dispatch(toastShown({ message: 'We have your request. Somebody from Endur will be in touch.' }));
      return undefined;
    } catch (error) {
      return rejectWithValue(asStoreError(error));
    }
  },
  { condition: (_, { getState }) => !selectPlan(getState()).askSending },
);

export const planScreenSlice = createSlice({
  name: 'plan',
  initialState,
  reducers: {
    checkoutOpened(state, action: PayloadAction<{ tier: Tier; pricedFrom: Tier | null }>) {
      state.paying = action.payload;
      state.failure = null;
    },
    /** Cancelled, or the success screen has been seen. */
    checkoutClosed(state) {
      state.paying = null;
    },
    enterpriseAskOpened(state) {
      state.asking = true;
      state.failure = null;
    },
    enterpriseNoteEdited(state, action: PayloadAction<{ note: string }>) {
      state.askNote = action.payload.note;
    },
    enterpriseAskClosed(state) {
      if (state.askSending) return;
      state.asking = false;
      state.askNote = '';
    },
    planLeft() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(tierJoined.pending, (state, action) => {
        state.busyTier = action.meta.arg.tier;
        state.failure = null;
      })
      // The checkout stays open: it is showing "Payment successful", and closes itself.
      .addCase(tierJoined.fulfilled, (state) => {
        state.busyTier = null;
      })
      .addCase(tierJoined.rejected, (state, action) => {
        state.busyTier = null;
        state.paying = null;
        if (action.payload) state.failure = { during: 'join', error: action.payload };
      })
      .addCase(enterpriseRequested.pending, (state) => {
        state.askSending = true;
        state.failure = null;
      })
      .addCase(enterpriseRequested.fulfilled, (state) => {
        state.askSending = false;
        state.asking = false;
        state.askNote = '';
      })
      .addCase(enterpriseRequested.rejected, (state, action) => {
        state.askSending = false;
        if (action.payload) state.failure = { during: 'ask', error: action.payload };
      })
      .addCase(signedOut, () => initialState);

    // Scheduling and cancelling a move down share one flag and one failure line.
    for (const thunk of [downgradeScheduled, downgradeCancelled]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.scheduling = true;
          state.failure = null;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.scheduling = false;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.scheduling = false;
          if (action.payload) state.failure = { during: 'schedule', error: action.payload };
        });
    }
  },
  selectors: {
    selectPlan: (state) => state,
  },
});

declare module '../index.js' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation
  export interface LazyLoadedSlices extends WithSlice<typeof planScreenSlice> {}
}

const injected = planScreenSlice.injectInto(rootReducer);

export const {
  checkoutOpened,
  checkoutClosed,
  enterpriseAskOpened,
  enterpriseNoteEdited,
  enterpriseAskClosed,
  planLeft,
} = planScreenSlice.actions;

export const { selectPlan } = injected.selectors;
