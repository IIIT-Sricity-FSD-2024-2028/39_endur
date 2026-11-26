// The results slice on its own (docs/REDUX-PLAN.md §6.10): the "just landed" maths as a
// reducer over each fulfilled poll, the export's lifecycle, and the page's lifetime.
import { describe, expect, it } from 'vitest';
import { signedOut } from '../authSlice.js';
import { resultsApi } from '../api/endpoints/results.js';
import {
  commentsExpanded,
  resultsExported,
  resultsPageLeft,
  resultsPageOpened,
  resultsScreenSlice,
  resultsShareClosed,
  resultsShareOpened,
} from './results.js';

const reduce = resultsScreenSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });

/** A fulfilled poll, shaped as RTK Query dispatches it. */
const poll = (count: number, search = '', campaignId = 'c1') => ({
  type: `${resultsApi.reducerPath}/executeQuery/fulfilled`,
  payload: { responseCount: count },
  meta: {
    arg: { type: 'query', endpointName: 'getResults', originalArgs: { campaignId, search }, queryCacheKey: 'k' },
    requestId: 'r',
    requestStatus: 'fulfilled',
    fulfilledTimeStamp: 1,
    baseQueryMeta: undefined,
    RTK_autoBatch: true,
  },
});

describe('results slice', () => {
  it('counts arrivals per answer, never on the first poll after opening', () => {
    let state = reduce(initial, resultsPageOpened({ campaignId: 'c1' }));
    state = reduce(state, poll(612));
    expect(state.pages.c1?.arrived['']).toBe(0);
    state = reduce(state, poll(614));
    expect(state.pages.c1?.arrived['']).toBe(2);
    // Nothing new: the "landed" moment does not hang around for a second poll.
    state = reduce(state, poll(614));
    expect(state.pages.c1?.arrived['']).toBe(0);
  });

  it('counts each filter separately', () => {
    let state = reduce(initial, resultsPageOpened({ campaignId: 'c1' }));
    state = reduce(state, poll(10, '?subjectId=s1'));
    state = reduce(state, poll(600));
    state = reduce(state, poll(11, '?subjectId=s1'));
    expect(state.pages.c1?.arrived).toEqual({ '?subjectId=s1': 1, '': 0 });
  });

  it('ignores a poll for a page that is not open, so a late answer cannot seed the next visit', () => {
    let state = reduce(initial, poll(612));
    expect(state.pages.c1).toBeUndefined();
    state = reduce(state, resultsPageOpened({ campaignId: 'c1' }));
    state = reduce(state, poll(700));
    expect(state.pages.c1?.arrived['']).toBe(0);
  });

  it('runs the export: in flight, then done or refused', () => {
    const arg = { campaignId: 'c1', filename: 'x.csv' };
    let state = reduce(initial, resultsExported.pending('r', arg));
    expect(state.pages.c1?.exporting).toBe(true);
    const refusal = { kind: 'api', status: 402, code: 'PAYMENT_REQUIRED', message: 'Not on your plan.', requestId: 'r', details: {}, retryAfter: null } as const;
    const refused = reduce(state, resultsExported.rejected(null, 'r', arg, refusal));
    expect(refused.pages.c1).toMatchObject({ exporting: false, exportError: refusal });
    state = reduce(state, resultsExported.fulfilled({ campaignId: 'c1' }, 'r', arg));
    expect(state.pages.c1).toMatchObject({ exporting: false, exportError: null });
  });

  it('opens the share sheet and the full comment list, and forgets all of it on leaving', () => {
    let state = reduce(initial, resultsShareOpened({ campaignId: 'c1' }));
    state = reduce(state, commentsExpanded({ campaignId: 'c1' }));
    expect(state.pages.c1).toMatchObject({ sharing: true, commentsExpanded: true });
    expect(reduce(state, resultsShareClosed({ campaignId: 'c1' })).pages.c1?.sharing).toBe(false);
    expect(reduce(state, resultsPageLeft({ campaignId: 'c1' })).pages.c1).toBeUndefined();
    expect(reduce(state, signedOut())).toEqual(initial);
  });
});
