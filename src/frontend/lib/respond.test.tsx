// T-039 — the respondent seam. 39 § Data contract, 13 §6, §7.
//
// The read is RTK Query now (store/api/endpoints/respond.ts), run for real over a stubbed
// `fetch`; the send is the respond slice's thunk (store/screens/respond.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { setupStore } from '../store/index.js';
import { errorReply, stubApi, type StubCall } from '../test-utils.js';
import { hasResponded, markResponded, usePublicCampaign } from './respond.js';

const CAMPAIGN = { campaignName: 'Mid-term', questions: [] };
let calls: StubCall[] = [];

function render(token: string | undefined) {
  const store = setupStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => usePublicCampaign(token), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
  calls = stubApi({ 'GET /public/campaigns/*': { body: { data: CAMPAIGN } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('loading the form', () => {
  it('asks for it once and hands back the whole payload', async () => {
    const { result } = render('K4M9X2PQ');
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Rule 7: the whole form in one request. On a venue network a second one is a second
    // chance to fail.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/public/campaigns/K4M9X2PQ');
    expect(result.current.campaign).toEqual(CAMPAIGN);
  });

  it('reads a members-only link as a gate to sign in at, not as an error', async () => {
    stubApi({
      'GET /public/campaigns/*': errorReply(401, 'SIGN_IN_REQUIRED', 'Only people in Northfield can answer this one.', {
        organizationName: 'Northfield',
      }),
    });
    const { result } = render('K4M9X2PQ');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.gate).toEqual({ kind: 'signIn', organizationName: 'Northfield' });
    // A gate is not a failure to retry.
    expect(result.current.error).toBeNull();
    expect(result.current.unavailable).toBe(false);
  });

  it('reads the uniform 404 as "not available", not as an error', async () => {
    stubApi({ 'GET /public/campaigns/*': errorReply(404, 'NOT_FOUND', 'x') });
    const { result } = render('NOPE');

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Bad token, not launched, not open yet, closed — the server refuses to say which, on
    // purpose (13 §6), so neither does this flag. CONF-015.
    expect(result.current.unavailable).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('keeps a transient failure separate, because that one is worth retrying', async () => {
    stubApi({ 'GET /public/campaigns/*': new Error('offline') });
    const { result } = render('K4M9X2PQ');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('treats a missing token as the same dead end, without a request', async () => {
    const { result } = render(undefined);
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Reachable: somebody types `/r/` from the back of the room.
    expect(calls).toHaveLength(0);
    expect(result.current.unavailable).toBe(true);
  });

  it('escapes the token rather than pasting it into a path', async () => {
    const { result } = render('a/b?c');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls[0]?.path).toBe('/public/campaigns/a%2Fb%3Fc');
  });
});

describe('the local marker, honestly best-effort', () => {
  it('remembers per token, not per device', () => {
    expect(hasResponded('AAA')).toBe(false);
    markResponded('AAA');
    expect(hasResponded('AAA')).toBe(true);
    // A second campaign on the same phone is a second form to fill in.
    expect(hasResponded('BBB')).toBe(false);
  });

  it('survives a browser that refuses to store anything', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // iOS Safari in private mode does exactly this. Throwing here would lose a response the
    // server has already accepted, to protect a marker that was never a guarantee.
    expect(() => markResponded('AAA')).not.toThrow();
    setItem.mockRestore();
  });
});
