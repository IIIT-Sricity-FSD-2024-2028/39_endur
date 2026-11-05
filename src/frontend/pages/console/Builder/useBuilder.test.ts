// The builder's load half: fetch a template and hand it to the builder slice (R-305), and
// the undo history surviving a route change and a reload (R-304).
//
// The draft's own behaviour (edits, undo, the save state machine) is tested where it now
// lives: store/builderSlice.test.ts for the reducers, store/middleware/autosave.test.ts for
// autosave. This file is what is left in the hook.
import { createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDetail } from '@endur/shared';
import { errorReply, stubApi, type StubCall } from '../../../test-utils.js';
import { setupStore, type AppStore } from '../../../store/index.js';
import { signedOut } from '../../../store/authSlice.js';
import { metaEdited, selectBuilder, undoRequested } from '../../../store/builderSlice.js';
import { HISTORY_WRITE_MS } from '../../../store/middleware/builderHistory.js';
import { ApiError } from '../../../lib/api.js';
import { useBuilder } from './useBuilder.js';


const template = (over: Partial<TemplateDetail> = {}): TemplateDetail => ({
  id: 't1', name: 'Mid-term check', category: 'Teaching', description: 'A short one.',
  industry: 'university', questionCount: 2, estimatedSeconds: 7, campaignCount: 0,
  isLibrary: false, clonedFromId: null, createdAt: '2026-01-01T00:00:00.000Z',
  readOnly: false,
  questions: [
    {
      id: 'q1', kind: 'rating', text: 'How clear was it?',
      config: { kind: 'rating', max: 5, lowLabel: 'Poor', highLabel: 'Great' },
      required: true, position: 0,
    },
    { id: 'q2', kind: 'yesno', text: 'Was the pace right?', config: { kind: 'yesno' }, required: false, position: 1 },
  ],
  ...over,
});

let calls: StubCall[];
const sent = (method: string) => calls.filter((call) => call.method === method);

/** The server, for one template: GET answers `detail`; saves succeed. */
function serve(detail: TemplateDetail | 'missing' = template()) {
  calls = stubApi({
    'GET /templates/t1': detail === 'missing' ? errorReply(404, 'NOT_FOUND', 'gone') : { body: { data: detail } },
    'PATCH /templates/t1': { body: { data: template() } },
    'PUT /templates/t1/questions': { body: { data: template() } },
  });
}

/** Mount against `store`, and let the initial load settle. */
async function mount(store: AppStore, detail = template()) {
  serve(detail);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
  const view = renderHook(() => useBuilder('t1'), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}

const builder = (store: AppStore) => selectBuilder(store.getState());

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loading turns a template into the slice\'s draft', () => {
  it('drops `position`: it is derived from array order on save and never sent', async () => {
    const store = setupStore();
    const { result } = await mount(store);
    expect(result.current.loading).toBe(false);
    // A client-supplied position and a client-supplied order can disagree, and then one of
    // them is silently wrong (37).
    for (const question of builder(store).draft.questions) {
      expect('position' in question).toBe(false);
    }
    expect(builder(store).draft.questions.map((q) => q.text)).toEqual([
      'How clear was it?', 'Was the pace right?',
    ]);
  });

  it('starts idle, and carries the lock from `readOnly`', async () => {
    const store = setupStore();
    await mount(store, template({ readOnly: true }));
    expect(builder(store).save).toBe('idle');
    expect(builder(store).locked).toBe(true);
    expect(sent('PUT')).toHaveLength(0);
  });

  it('surfaces a LOAD failure, which is a different thing from a save failure', async () => {
    const store = setupStore();
    serve('missing');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
    const { result } = renderHook(() => useBuilder('t1'), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // An ApiError, rebuilt from the store's plain error, so the page can show its message.
    expect(result.current.loadError).toBeInstanceOf(ApiError);
    expect(result.current.loadError?.message).toBe('gone');
    expect(result.current.template).toBeNull();
    expect(builder(store).templateId).toBeNull();
  });
});

describe('leaving the page', () => {
  it('saves what was typed at once, instead of dropping it with the debounce timer', async () => {
    const store = setupStore();
    const { unmount } = await mount(store);
    act(() => { store.dispatch(metaEdited({ name: 'Typed, then left' })); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(sent('PATCH')[0]?.body).toMatchObject({ name: 'Typed, then left' });
  });
});

describe('the undo history outlives the page (R-304, Q-2)', () => {
  it('survives a route change: leave, come back, and undo still works', async () => {
    const store = setupStore();
    const first = await mount(store);
    act(() => { store.dispatch(metaEdited({ name: 'Renamed' })); });
    first.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    // Back again. The server has the save, so its draft matches and the history is kept.
    await mount(store, template({ name: 'Renamed' }));
    expect(builder(store).past).toHaveLength(1);

    act(() => { store.dispatch(undoRequested()); });
    expect(builder(store).draft.name).toBe('Mid-term check');
  });

  it('survives a reload, through sessionStorage', async () => {
    const before = setupStore();
    await mount(before);
    act(() => { before.dispatch(metaEdited({ name: 'Renamed' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.max(HISTORY_WRITE_MS, 900)); });

    // A reload is a brand-new store with the same tab's sessionStorage.
    const after = setupStore();
    await mount(after, template({ name: 'Renamed' }));
    expect(builder(after).past).toHaveLength(1);
    expect(builder(after).past[0]?.name).toBe('Mid-term check');
  });

  it('is thrown away after a reload if the server copy no longer matches it', async () => {
    const before = setupStore();
    await mount(before);
    act(() => { before.dispatch(metaEdited({ name: 'Renamed' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    // Someone else saved over it in the meantime.
    const after = setupStore();
    await mount(after, template({ name: 'Somebody else\'s name' }));
    expect(builder(after).past).toEqual([]);
    expect(builder(after).draft.name).toBe('Somebody else\'s name');
  });

  it('is cleared from sessionStorage by signing out', async () => {
    const store = setupStore();
    await mount(store);
    act(() => { store.dispatch(metaEdited({ name: 'Renamed' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(window.sessionStorage.length).toBe(1);

    act(() => { store.dispatch(signedOut()); });
    expect(window.sessionStorage.length).toBe(0);
  });
});
