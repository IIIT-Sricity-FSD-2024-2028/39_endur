// Home's slice on its own (docs/REDUX-PLAN.md §6.10). The page is pages/console/Home/*.test.tsx.
import { describe, expect, it } from 'vitest';
import { signedOut } from '../authSlice.js';
import {
  announcementDismissed,
  homeLeft,
  homeRangeChosen,
  homeScreenSlice,
  homeShareClosed,
  homeShareOpened,
  pastFeedbackToggled,
  waitingFormAnswered,
  waitingFormToggled,
} from './home.js';

const reduce = homeScreenSlice.reducer;
const initial = reduce(undefined, { type: '@@init' });

describe('home slice', () => {
  it('starts on 30 days with nothing open', () => {
    expect(initial).toEqual({
      range: '30d', sharingId: null, dismissed: [], answeringId: null, pastExpanded: false,
    });
  });

  it('records the range and the share sheet', () => {
    let state = reduce(initial, homeRangeChosen({ range: '7d' }));
    state = reduce(state, homeShareOpened({ campaignId: 'c1' }));
    expect(state).toMatchObject({ range: '7d', sharingId: 'c1' });
    expect(reduce(state, homeShareClosed()).sharingId).toBeNull();
  });

  it('unfolds one waiting form at a time, folds it again, and folds it once answered', () => {
    let state = reduce(initial, waitingFormToggled({ campaignId: 'c1' }));
    state = reduce(state, waitingFormToggled({ campaignId: 'c2' }));
    expect(state.answeringId).toBe('c2');
    expect(reduce(state, waitingFormToggled({ campaignId: 'c2' })).answeringId).toBeNull();
    expect(reduce(state, waitingFormAnswered()).answeringId).toBeNull();
  });

  it('puts an announcement away the moment it is dismissed, once', () => {
    let state = reduce(initial, announcementDismissed.pending('r1', 'a1'));
    state = reduce(state, announcementDismissed.pending('r2', 'a1'));
    expect(state.dismissed).toEqual(['a1']);
  });

  it('unfolds past feedback and folds it again', () => {
    const state = reduce(initial, pastFeedbackToggled());
    expect(state.pastExpanded).toBe(true);
    expect(reduce(state, pastFeedbackToggled()).pastExpanded).toBe(false);
  });

  it('opens as it always did after leaving, or a new session', () => {
    const busy = reduce(reduce(initial, homeRangeChosen({ range: '7d' })), pastFeedbackToggled());
    expect(reduce(busy, homeLeft())).toEqual(initial);
    expect(reduce(busy, signedOut())).toEqual(initial);
  });
});
