// R-405: the subject hooks on RTK Query, over a stubbed `fetch`.
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Page, SubjectDetail, SubjectSummary } from '@endur/shared';
import { setupStore } from '../store/index.js';
import { errorReply, heldReply, stubApi, type StubReply } from '../test-utils.js';
import { ApiError } from './api.js';
import { useSubject, useSubjectList } from './subjects.js';

const pageOf = (...names: string[]): Page<SubjectSummary> => ({
  data: names.map((name) => ({ id: name, name }) as SubjectSummary),
  page: { nextCursor: null, hasMore: false },
  meta: { total: names.length },
});
const reply = (...names: string[]): StubReply => ({ body: pageOf(...names) });

function wrapperFor() {
  const store = setupStore();
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSubjectList', () => {
  // A search per keystroke: "a" is sent, then "ab". If "a" is slower and answers last, the list
  // must still show the results for "ab", which is what the box says.
  it('keeps the newest search when an older answer arrives last', async () => {
    const slow = heldReply(reply('a'));
    const fast = heldReply(reply('ab'));
    stubApi({ 'GET /subjects?q=a': () => slow.promise, 'GET /subjects?q=ab': () => fast.promise });

    const { result, rerender } = renderHook(({ q }) => useSubjectList({ q }), {
      wrapper: wrapperFor(),
      initialProps: { q: 'a' },
    });
    rerender({ q: 'ab' });

    await act(async () => { fast.release(); await fast.promise; });
    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('ab'));
    await act(async () => { slow.release(); await slow.promise; });

    // The late answer went into its own cache entry, not onto the screen.
    expect(result.current.data?.data[0]?.name).toBe('ab');
  });

  it('a rename shows at once in EVERY read of that subject, before the server answers', async () => {
    const answer = heldReply({ body: { data: { id: 's1', name: 'Data Structures II' } } });
    stubApi({
      'GET /subjects': reply('s1', 's2'),
      'GET /subjects?q=s': reply('s1'),
      'GET /subjects/s1': { body: { data: { id: 's1', name: 's1', cycles: [] } as unknown as SubjectDetail } },
      'PATCH /subjects/s1': () => answer.promise,
    });
    const { result } = renderHook(
      () => ({ all: useSubjectList({}), filtered: useSubjectList({ q: 's' }), detail: useSubject('s1') }),
      { wrapper: wrapperFor() },
    );
    await waitFor(() => expect(result.current.detail.data).not.toBeNull());
    await waitFor(() => expect(result.current.filtered.data).not.toBeNull());

    let renamed!: Promise<void>;
    act(() => { renamed = result.current.all.rename('s1', 'Data Structures II'); });

    await waitFor(() => expect(result.current.all.data?.data[0]?.name).toBe('Data Structures II'));
    expect(result.current.filtered.data?.data[0]?.name).toBe('Data Structures II');
    expect(result.current.detail.data?.name).toBe('Data Structures II');
    answer.release();
    await act(async () => { await renamed; });
  });

  it('a refused rename puts the old name back everywhere, and throws the reason', async () => {
    stubApi({
      'GET /subjects': reply('s1'),
      'PATCH /subjects/s1': errorReply(409, 'CONFLICT', 'That name is taken.'),
    });
    const { result } = renderHook(() => useSubjectList({}), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    let failure: unknown;
    await act(async () => {
      failure = await result.current.rename('s1', 'Taken').catch((error: unknown) => error);
    });

    expect(failure).toBeInstanceOf(ApiError);
    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('s1'));
  });

  it('archive() re-reads the list, and resolves once it is in', async () => {
    let archived = false;
    stubApi({
      'GET /subjects': () => (archived ? reply('s2') : reply('s1', 's2')),
      'POST /subjects/s1/archive': () => {
        archived = true;
        return { body: { data: { id: 's1', name: 's1' } } };
      },
    });
    const { result } = renderHook(() => useSubjectList({}), { wrapper: wrapperFor() });
    await waitFor(() => expect(result.current.data?.data).toHaveLength(2));

    await act(async () => { await result.current.archive('s1'); });

    expect(result.current.data?.data.map((row) => row.id)).toEqual(['s2']);
  });
});

describe('useSubject', () => {
  it('without an id it asks nothing, and reads as loading', () => {
    const calls = stubApi({});
    const { result } = renderHook(() => useSubject(undefined), { wrapper: wrapperFor() });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
