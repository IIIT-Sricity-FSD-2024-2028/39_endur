// R-201: the template hooks on RTK Query. Same names and return shapes as before (the pages'
// tests mock them and pass unchanged); these run them for real, over a stubbed `fetch`.
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDetail, TemplateSummary } from '@endur/shared';
import { setupStore, type AppStore } from '../store/index.js';
import { errorReply, stubApi } from '../test-utils.js';
import { ApiError } from './api.js';
import { useTemplate, useTemplateLibrary, useTemplates } from './templates.js';

const summary = (id: string, name: string): TemplateSummary => ({
  id, name, category: 'Teaching', description: null, industry: 'university', questionCount: 2,
  estimatedSeconds: 7, campaignCount: 0, isLibrary: false, clonedFromId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const detail = (id: string, name: string): TemplateDetail => ({
  ...summary(id, name), description: '', readOnly: false, questions: [],
});

function render<T>(hook: () => T, store: AppStore = setupStore()) {
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...renderHook(hook, { wrapper }), store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTemplateLibrary', () => {
  it('loads the library and hands the page the rows, not the envelope', async () => {
    stubApi({ 'GET /templates/library': { body: { data: [summary('l1', 'Stay feedback')] } } });
    const { result } = render(() => useTemplateLibrary());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.map((row) => row.name)).toEqual(['Stay feedback']);
    expect(result.current.error).toBeNull();
  });
});

describe('useTemplates: the list refreshes itself (tag invalidation)', () => {
  it('remove() deletes, and the list refetches without anybody calling reload', async () => {
    const calls = stubApi({
      'GET /templates': (_call, count) => ({
        body: { data: count === 1 ? [summary('t1', 'One'), summary('t2', 'Two')] : [summary('t2', 'Two')], nextCursor: null },
      }),
      'DELETE /templates/t1': { status: 204 },
    });
    const { result } = render(() => useTemplates());
    await waitFor(() => expect(result.current.data?.data).toHaveLength(2));

    await act(async () => { await result.current.remove('t1'); });

    await waitFor(() => expect(result.current.data?.data.map((row) => row.id)).toEqual(['t2']));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /templates', 'DELETE /templates/t1', 'GET /templates',
    ]);
  });

  it('clone() sends the caller\'s idempotency key, returns the new template, and the list refetches', async () => {
    const calls = stubApi({
      'GET /templates': { body: { data: [], nextCursor: null } },
      'POST /templates/l1/clone': { body: { data: detail('t9', 'Stay feedback (copy)') } },
    });
    const { result } = render(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: TemplateDetail | undefined;
    await act(async () => { created = await result.current.clone('l1', 'clone:l1:abc'); });

    expect(created?.id).toBe('t9');
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.headers.get('Idempotency-Key')).toBe('clone:l1:abc');
    await waitFor(() => expect(calls.filter((call) => call.path === '/templates')).toHaveLength(2));
  });

  it('a failed mutation throws an ApiError the page can read', async () => {
    stubApi({
      'GET /templates': { body: { data: [], nextCursor: null } },
      'DELETE /templates/t1': errorReply(409, 'CONFLICT', 'That template is used by 2 campaigns.'),
    });
    const { result } = render(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const failure = await result.current.remove('t1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe('That template is used by 2 campaigns.');
  });

  it('keeps the last good page on screen when a reload fails, with the error beside it', async () => {
    stubApi({
      'GET /templates': (_call, count) =>
        count === 1 ? { body: { data: [summary('t1', 'One')], nextCursor: null } } : errorReply(500, 'INTERNAL', 'Down.'),
    });
    const { result } = render(() => useTemplates());
    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    await act(async () => { await result.current.reload(); });

    // `reload()` settles a beat before React re-renders with the failure, hence `waitFor`.
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(result.current.data?.data).toHaveLength(1);
  });
});

describe('useTemplate', () => {
  const routes = () => stubApi({
    'GET /templates/a': { body: { data: detail('a', 'Alpha') } },
    'GET /templates/b': { body: { data: detail('b', 'Beta') } },
  });

  it('never shows one template\'s data while another loads', async () => {
    routes();
    const store = setupStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    const { result, rerender } = renderHook(({ id }: { id: string }) => useTemplate(id), {
      wrapper,
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.data?.name).toBe('Alpha'));

    rerender({ id: 'b' });
    // A dialog opened for Beta must not show Alpha's questions while Beta loads.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data?.name).toBe('Beta'));
  });

  it('shows the cached copy at once on the next visit, and still refetches it', async () => {
    const calls = routes();
    const store = setupStore();
    const first = render(() => useTemplate('a'), store);
    await waitFor(() => expect(first.result.current.data?.name).toBe('Alpha'));
    first.unmount();

    const again = render(() => useTemplate('a'), store);
    // No skeleton: the copy from a moment ago is on screen while the fresh one loads.
    expect(again.result.current.data?.name).toBe('Alpha');
    expect(again.result.current.loading).toBe(true);
    await waitFor(() => expect(again.result.current.loading).toBe(false));
    expect(calls).toHaveLength(2);
  });

  it('without an id, it asks for nothing and reads as loading, as before', () => {
    const calls = routes();
    const { result } = render(() => useTemplate(undefined));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
