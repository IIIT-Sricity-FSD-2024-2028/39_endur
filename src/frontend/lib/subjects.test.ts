import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Page, SubjectSummary } from '@endur/shared';
import { useSubjectList } from './subjects.js';

const apiGet = vi.fn<(path: string) => Promise<unknown>>();
vi.mock('./api.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./api.js');
  return { ...actual, apiGet: (path: string) => apiGet(path) };
});

const pageOf = (name: string): Page<SubjectSummary> => ({
  data: [{ id: name, name } as SubjectSummary],
  page: { nextCursor: null, hasMore: false },
  meta: { total: 1 },
});

describe('useSubjectList', () => {
  // A search per keystroke: "a" is sent, then "ab". If "a" is slower and answers last, the list
  // must still show the results for "ab", which is what the box says.
  it('keeps the newest search when an older answer arrives last', async () => {
    const pending = new Map<string, (value: unknown) => void>();
    apiGet.mockImplementation((path) => new Promise((resolve) => pending.set(path, resolve)));

    const { result, rerender } = renderHook(({ q }) => useSubjectList({ q }), {
      initialProps: { q: 'a' },
    });
    rerender({ q: 'ab' });
    await waitFor(() => expect(pending.size).toBe(2));

    const answer = async (path: string, page: Page<SubjectSummary>): Promise<void> => {
      await act(async () => {
        pending.get(path)!(page);
        await Promise.resolve();
      });
    };
    const [older, newer] = [...pending.keys()];
    await answer(newer!, pageOf('ab'));
    await answer(older!, pageOf('a'));

    expect(result.current.data?.data[0]?.name).toBe('ab');
  });
});
