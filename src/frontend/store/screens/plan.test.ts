// The Plan page's slice and its thunks against a stubbed server (docs/REDUX-PLAN.md §6.10,
// R-710). The page itself is pages/console/Plan/Plan.test.tsx.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BillingSummary } from '@endur/shared';
import { signedOut } from '../authSlice.js';
import { billingApi } from '../api/endpoints/billing.js';
import { errorReply, makeStore, stubApi } from '../../test-utils.js';
import {
  checkoutClosed,
  downgradeCancelled,
  downgradeScheduled,
  enterpriseAskClosed,
  enterpriseNoteEdited,
  enterpriseRequested,
  planChosen,
  planLeft,
  planScreenSlice,
  selectPlan,
  tierJoined,
} from './plan.js';

const SUMMARY: BillingSummary = {
  tier: 'silver',
  status: 'active',
  periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z',
  pendingTier: null,
  lapsedFrom: null,
  lapsedFromTrial: null,
  seats: 3,
  seatBreakdown: { activeUsers: 3, nonPersonSubjects: 0 },
};
const answer = (summary: BillingSummary) => ({ body: { data: summary } });
const reduce = planScreenSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });

/** A signed-in store with the summary read, as the page has it before any button works. */
async function storeWith() {
  const store = makeStore();
  await store.dispatch(billingApi.endpoints.getBilling.initiate());
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('choosing a plan', () => {
  it('opens the checkout for a tier above, priced from the current one', async () => {
    stubApi({ 'GET /billing': answer(SUMMARY), 'GET /billing/plans': { body: { data: [] } } });
    const store = await storeWith();
    store.dispatch(planChosen('gold'));
    expect(selectPlan(store.getState()).paying).toEqual({ tier: 'gold', pricedFrom: 'silver' });
  });

  it('asks about Enterprise instead of selling it', async () => {
    stubApi({ 'GET /billing': answer(SUMMARY) });
    const store = await storeWith();
    store.dispatch(planChosen('enterprise'));
    expect(selectPlan(store.getState())).toMatchObject({ paying: null, asking: true });
  });

  it('does nothing for the current tier or one below, once paid for', async () => {
    stubApi({ 'GET /billing': answer(SUMMARY) });
    const store = await storeWith();
    store.dispatch(planChosen('silver'));
    store.dispatch(planChosen('bronze'));
    expect(selectPlan(store.getState())).toEqual(initial);
  });

  it('does nothing before the summary has arrived', () => {
    const store = makeStore();
    store.dispatch(planChosen('gold'));
    expect(selectPlan(store.getState())).toEqual(initial);
  });
});

describe('joining', () => {
  it('sends the tier and the checkout\'s reference, and puts the answer in the cache', async () => {
    const calls = stubApi({
      'GET /billing': answer(SUMMARY),
      'POST /billing/tier': answer({ ...SUMMARY, tier: 'gold' }),
    });
    const store = await storeWith();
    store.dispatch(planChosen('gold'));
    const done = store.dispatch(tierJoined({ tier: 'gold', paymentRef: 'endur_abc123' }));
    expect(selectPlan(store.getState()).busyTier).toBe('gold');
    await done;

    expect(calls.at(-1)?.body).toEqual({ tier: 'gold', paymentRef: 'endur_abc123' });
    expect(billingApi.endpoints.getBilling.select()(store.getState()).data?.tier).toBe('gold');
    // The checkout stays: it is showing "Payment successful" and closes itself.
    expect(selectPlan(store.getState())).toMatchObject({ busyTier: null, paying: { tier: 'gold' } });
    expect(store.getState().ui.toast?.message).toMatch(/You are on/);
  });

  it('closes the checkout and keeps the refusal on a failure', async () => {
    stubApi({
      'GET /billing': answer(SUMMARY),
      'POST /billing/tier': errorReply(409, 'CONFLICT', 'The plan changed.'),
    });
    const store = await storeWith();
    store.dispatch(planChosen('gold'));
    await store.dispatch(tierJoined({ tier: 'gold', paymentRef: 'endur_abc123' }));

    const state = selectPlan(store.getState());
    expect(state.paying).toBeNull();
    expect(state.failure).toMatchObject({ during: 'join', error: { message: 'The plan changed.' } });
    expect(billingApi.endpoints.getBilling.select()(store.getState()).data?.tier).toBe('silver');
  });

  it('joins once on a double press', async () => {
    const calls = stubApi({ 'GET /billing': answer(SUMMARY), 'POST /billing/tier': answer(SUMMARY) });
    const store = await storeWith();
    await Promise.all([
      store.dispatch(tierJoined({ tier: 'gold', paymentRef: 'a' })),
      store.dispatch(tierJoined({ tier: 'gold', paymentRef: 'b' })),
    ]);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  // Never an amount, and no empty paymentRef key either: the DTO would have to tolerate it.
  it('the endpoint sends only the tier when there is no reference', async () => {
    const calls = stubApi({ 'POST /billing/tier': answer(SUMMARY) });
    const store = makeStore();
    await store.dispatch(billingApi.endpoints.joinTier.initiate({ tier: 'silver' }));
    expect(calls[0]?.body).toEqual({ tier: 'silver' });
  });
});

describe('a move down — DEC-098', () => {
  it('schedules with a POST, cancels with a DELETE, and the cache follows both', async () => {
    const calls = stubApi({
      'GET /billing': answer(SUMMARY),
      'POST /billing/downgrade': answer({ ...SUMMARY, pendingTier: 'bronze' }),
      'DELETE /billing/downgrade': answer(SUMMARY),
    });
    const store = await storeWith();
    const summary = () => billingApi.endpoints.getBilling.select()(store.getState()).data;

    await store.dispatch(downgradeScheduled('bronze'));
    expect(calls.at(-1)?.body).toEqual({ tier: 'bronze' });
    expect(summary()?.pendingTier).toBe('bronze');
    expect(store.getState().ui.toast?.message).toMatch(/scheduled for/);

    await store.dispatch(downgradeCancelled());
    expect(calls.at(-1)?.method).toBe('DELETE');
    expect(summary()?.pendingTier).toBeNull();
    expect(store.getState().ui.toast?.message).toMatch(/cancelled/);
    expect(selectPlan(store.getState()).scheduling).toBe(false);
  });

  it('keeps a refusal in the schedule\'s own words', async () => {
    stubApi({ 'GET /billing': answer(SUMMARY), 'POST /billing/downgrade': new TypeError('offline') });
    const store = await storeWith();
    await store.dispatch(downgradeScheduled('bronze'));
    expect(selectPlan(store.getState()).failure?.during).toBe('schedule');
  });
});

describe('asking for Enterprise — DEC-100', () => {
  it('sends the typed note, trimmed, then closes and reads as requested', async () => {
    const calls = stubApi({
      'GET /billing': answer(SUMMARY),
      'POST /billing/enterprise-request': { body: { data: { requestedAt: '2026-10-17T00:00:00.000Z' } } },
    });
    const store = await storeWith();
    store.dispatch(planChosen('enterprise'));
    store.dispatch(enterpriseNoteEdited({ note: '  call after 5pm  ' }));
    await store.dispatch(enterpriseRequested());

    expect(calls.at(-1)?.body).toEqual({ note: 'call after 5pm' });
    expect(selectPlan(store.getState())).toMatchObject({ asking: false, askNote: '', askSending: false });
    expect(billingApi.endpoints.getEnterpriseRequest.select()(store.getState()).data?.requestedAt)
      .toBe('2026-10-17T00:00:00.000Z');
  });

  it('sends no note when none was typed', async () => {
    const calls = stubApi({
      'POST /billing/enterprise-request': { body: { data: { requestedAt: '2026-10-17T00:00:00.000Z' } } },
    });
    const store = makeStore();
    store.dispatch(enterpriseNoteEdited({ note: '   ' }));
    await store.dispatch(enterpriseRequested());
    expect(calls[0]?.body).toEqual({});
  });

  it('keeps the dialog and the note when it did not go', async () => {
    stubApi({ 'POST /billing/enterprise-request': errorReply(500, 'INTERNAL', 'x') });
    const store = makeStore();
    store.dispatch(planChosen('enterprise'));
    store.dispatch(enterpriseNoteEdited({ note: 'hi' }));
    await store.dispatch(enterpriseRequested());
    expect(selectPlan(store.getState()).askNote).toBe('hi');
    expect(selectPlan(store.getState()).failure?.during).toBe('ask');
  });
});

describe('the slice', () => {
  it('does not close the ask while it is sending', () => {
    let state = reduce(initial, { type: 'plan/enterpriseAskOpened' });
    state = reduce(state, enterpriseRequested.pending('r1', undefined));
    expect(reduce(state, enterpriseAskClosed()).asking).toBe(true);
  });

  it('closes the checkout, and starts afresh after leaving or signing out', () => {
    const busy = reduce(initial, { type: 'plan/checkoutOpened', payload: { tier: 'gold', pricedFrom: null } });
    expect(reduce(busy, checkoutClosed()).paying).toBeNull();
    expect(reduce(busy, planLeft())).toEqual(initial);
    expect(reduce(busy, signedOut())).toEqual(initial);
  });
});
