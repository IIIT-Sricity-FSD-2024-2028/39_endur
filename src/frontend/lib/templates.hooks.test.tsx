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
import { templateCopied, templateDeleted } from '../store/screens/templates.js';
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
  // The commands are thunks over RTK Query (store/screens/templates.ts); what matters here
  // is that the list they change re-reads by itself, through the tags.
  it('a delete re-reads the list without anybody calling reload', async () => {
    const calls = stubApi({
      'GET /templates': (_call, count) => ({
        body: { data: count === 1 ? [summary('t1', 'One'), summary('t2', 'Two')] : [summary('t2', 'Two')], nextCursor: null },
      }),
      'DELETE /templates/t1': { status: 204 },
    });
    const store = setupStore();
    const { result } = render(() => useTemplates(), store);
    await waitFor(() => expect(result.current.data?.data).toHaveLength(2));

    await act(async () => {
      await store.dispatch(templateDeleted({ templateId: 't1', name: 'One', from: 'card' }));
    });

    await waitFor(() => expect(result.current.data?.data.map((row) => row.id)).toEqual(['t2']));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /templates', 'DELETE /templates/t1', 'GET /templates',
    ]);
  });

  it('a copy sends an idempotency key per attempt, returns the new template, and the list re-reads', async () => {
    const calls = stubApi({
      'GET /templates': { body: { data: [], nextCursor: null } },
      'POST /templates/l1/clone': { body: { data: detail('t9', 'Stay feedback (copy)') } },
    });
    const store = setupStore();
    const { result } = render(() => useTemplates(), store);
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: unknown;
    await act(async () => {
      created = (await store.dispatch(templateCopied({ templateId: 'l1', from: 'card' }))).payload;
    });
    await act(async () => {
      await store.dispatch(templateCopied({ templateId: 'l1', from: 'card' }));
    });

    expect((created as TemplateDetail).id).toBe('t9');
    // A key carries the template it belongs to, and two presses are two copies: the key
    // exists for the RETRY of one press, which the server answers with the first response.
    const keys = calls.filter((call) => call.method === 'POST').map((call) => call.headers.get('Idempotency-Key'));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^clone:l1:/);
    expect(keys[0]).not.toBe(keys[1]);
    await waitFor(() => expect(calls.filter((call) => call.path === '/templates').length).toBeGreaterThanOrEqual(2));
  });

  it('a refused command lands on the card, in the server\'s words', async () => {
    stubApi({
      'GET /templates': { body: { data: [], nextCursor: null } },
      'DELETE /templates/t1': errorReply(409, 'CONFLICT', 'That template is used by 2 campaigns.'),
    });
    const store = setupStore();
    await act(async () => {
      await store.dispatch(templateDeleted({ templateId: 't1', name: 'One', from: 'card' }));
    });
    const failed = store.getState().templates?.cardError;
    expect(failed).toMatchObject({ id: 't1', during: 'delete', error: { message: 'That template is used by 2 campaigns.' } });
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
