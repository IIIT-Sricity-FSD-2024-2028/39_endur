// T-039 — the respondent seam. 39 § Data contract, 13 §6, §7.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ApiError } from './api.js';
import { hasResponded, markResponded, submitKey, submitResponse, usePublicCampaign } from './respond.js';

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('./api.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
    apiPost: (...args: unknown[]) => apiPost(...args) as unknown,
  };
});

const CAMPAIGN = { campaignName: 'Mid-term', questions: [] };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  apiGet.mockResolvedValue({ data: CAMPAIGN });
  apiPost.mockResolvedValue({ data: { ok: true, responseCount: 613 } });
});

describe('loading the form', () => {
  it('asks for it once and hands back the whole payload', async () => {
    const { result } = renderHook(() => usePublicCampaign('K4M9X2PQ'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Rule 7: the whole form in one request. On a venue network a second one is a second
    // chance to fail.
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet.mock.calls[0]?.[0]).toBe('/public/campaigns/K4M9X2PQ');
    expect(result.current.campaign).toEqual(CAMPAIGN);
  });

  it('does not let a public 401 sign anybody out', async () => {
    const { result } = renderHook(() => usePublicCampaign('K4M9X2PQ'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // A respondent has no session, so a 401 here would not be an expired one. It cannot
    // happen — the public routes are TENANTLESS so a bad token 404s — but the seam should
    // not depend on that staying true in a file it does not own.
    expect(apiGet.mock.calls[0]?.[1]).toMatchObject({ suppress401Handler: true });
  });

  it('reads the uniform 404 as "not available", not as an error', async () => {
    apiGet.mockRejectedValue(new ApiError({ code: 'NOT_FOUND', status: 404, requestId: 'r', message: 'x' }));
    const { result } = renderHook(() => usePublicCampaign('NOPE'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Bad token, not launched, not open yet, closed — the server refuses to say which, on
    // purpose (13 §6), so neither does this flag. CONF-015.
    expect(result.current.unavailable).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('keeps a transient failure separate, because that one is worth retrying', async () => {
    apiGet.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePublicCampaign('K4M9X2PQ'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unavailable).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('treats a missing token as the same dead end, without a request', async () => {
    const { result } = renderHook(() => usePublicCampaign(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Reachable: somebody types `/r/` from the back of the room.
    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.unavailable).toBe(true);
  });

  it('escapes the token rather than pasting it into a path', async () => {
    const { result } = renderHook(() => usePublicCampaign('a/b?c'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiGet.mock.calls[0]?.[0]).toBe('/public/campaigns/a%2Fb%3Fc');
  });
});

describe('submitting', () => {
  it('carries the idempotency key and unwraps the count', async () => {
    const result = await submitResponse('K4M9X2PQ', { answers: [], channel: 'link' }, 'k1');
    expect(apiPost.mock.calls[0]?.[2]).toMatchObject({ idempotencyKey: 'k1' });
    expect(result.responseCount).toBe(613);
  });

  it('mints a different key for every fill', () => {
    // 13 §7 keys respondent submit "on the invitation token", which is right for one token
    // per person. An OPEN link is the opposite: everyone in the room holds the same token,
    // so keying on it would replay the first person's 201 to the second and the campaign
    // would collect exactly one response in front of the evaluator.
    const a = submitKey('K4M9X2PQ');
    const b = submitKey('K4M9X2PQ');
    expect(a).not.toBe(b);
    expect(a).toContain('K4M9X2PQ');
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
