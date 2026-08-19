// T-037 — the builder's draft and its autosave. 37 § State, § Interactions.
//
// The acceptance criterion this file exists for is "autosave never loses typed input,
// including across a failed save and a retry". That is not observable by looking at the
// screen — it needs a failing request, a keystroke during a request, and an unmount, all of
// which are cheap here and impossible to rehearse by hand.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateDetail } from '@endur/shared';
import { useBuilder } from './useBuilder.js';

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPut = vi.fn();

vi.mock('../../../lib/api.js', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args) as unknown,
  apiPatch: (...args: unknown[]) => apiPatch(...args) as unknown,
  apiPut: (...args: unknown[]) => apiPut(...args) as unknown,
  ApiError: class extends Error {},
}));

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

/** Mount, and let the initial load settle. */
async function mount(detail = template()) {
  apiGet.mockResolvedValue({ data: detail });
  const view = renderHook(() => useBuilder('t1'));
  await act(async () => { await Promise.resolve(); });
  return view;
}

/** Push past the 800ms debounce and let the request settle. */
async function settle(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(900);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  apiPatch.mockResolvedValue({ data: template() });
  apiPut.mockResolvedValue({ data: template() });
});
afterEach(() => vi.useRealTimers());

describe('loading turns a template into a draft', () => {
  it('drops `position` — it is derived from array order on save and never sent', async () => {
    const { result } = await mount();
    // A client-supplied position and a client-supplied order can disagree, and then one of
    // them is silently wrong (37).
    for (const question of result.current.draft.questions) {
      expect('position' in question).toBe(false);
    }
    expect(result.current.draft.questions.map((q) => q.text)).toEqual([
      'How clear was it?', 'Was the pace right?',
    ]);
  });

  it('starts idle — an indicator saying "Saved" before any save is reporting on nothing', async () => {
    const { result } = await mount();
    expect(result.current.save).toBe('idle');
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('surfaces a LOAD failure, which is a different thing from a save failure', async () => {
    apiGet.mockRejectedValue(new Error('gone'));
    const { result } = renderHook(() => useBuilder('t1'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.loadError?.message).toBe('gone');
    expect(result.current.template).toBeNull();
  });
});

describe('autosave is debounced, and says only what is true', () => {
  it('does not fire before 800ms, and fires once for a burst of typing', async () => {
    const { result } = await mount();
    act(() => result.current.setMeta({ name: 'M' }));
    act(() => result.current.setMeta({ name: 'Mi' }));
    act(() => result.current.setMeta({ name: 'Mid' }));
    expect(result.current.save).toBe('dirty');

    act(() => { vi.advanceTimersByTime(700); });
    expect(apiPatch).not.toHaveBeenCalled();

    await settle();
    expect(apiPatch).toHaveBeenCalledTimes(1);
    // The LAST value, not the one captured when the first timer was set.
    expect(apiPatch.mock.calls[0]?.[1]).toMatchObject({ name: 'Mid' });
    expect(result.current.save).toBe('saved');
  });

  it('sends the meta and the questions to their OWN endpoints', async () => {
    const { result } = await mount();
    act(() => result.current.setMeta({ description: 'Two minutes.' }));
    await settle();
    // Renaming a form must not rewrite its questions (37 § Data contract).
    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(apiPut).not.toHaveBeenCalled();

    act(() => result.current.addQuestion());
    await settle();
    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it('saves the whole question set in ONE request, not one per question', async () => {
    const { result } = await mount();
    act(() => result.current.addQuestion());
    act(() => result.current.addQuestion());
    act(() => result.current.setQuestions([...result.current.draft.questions].reverse()));
    await settle();

    expect(apiPut).toHaveBeenCalledTimes(1);
    const body = apiPut.mock.calls[0]?.[1] as { questions: unknown[] };
    expect(body.questions).toHaveLength(4);
  });

  it('never reports "Saved" over a keystroke that arrived mid-request', async () => {
    let release: (value: unknown) => void = () => undefined;
    apiPatch.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const { result } = await mount();

    act(() => result.current.setMeta({ name: 'First' }));
    await act(async () => { vi.advanceTimersByTime(900); await Promise.resolve(); });
    expect(result.current.save).toBe('saving');

    // Typed while the request was in flight.
    act(() => result.current.setMeta({ name: 'Second' }));
    await act(async () => { release({ data: template() }); await Promise.resolve(); });

    // "Saved" here would be the one lie this indicator can tell.
    expect(result.current.save).toBe('dirty');
    expect(result.current.draft.name).toBe('Second');
  });
});

describe('a failed save costs the reader nothing but a retry', () => {
  it('retries once automatically, then stops and hands over a button', async () => {
    apiPatch.mockRejectedValue(new Error('offline'));
    const { result } = await mount();
    act(() => result.current.setMeta({ name: 'Renamed' }));

    await settle();
    // First failure: one silent retry rather than an error the reader has to read.
    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(result.current.save).toBe('dirty');

    await settle();
    expect(apiPatch).toHaveBeenCalledTimes(2);
    // Retrying forever hides the fault.
    expect(result.current.save).toBe('error');
    expect(result.current.saveError?.message).toBe('offline');
  });

  it('KEEPS the draft through both failures — nothing is reloaded or reset', async () => {
    apiPut.mockRejectedValue(new Error('offline'));
    const { result } = await mount();
    act(() => result.current.setQuestions([]));
    await settle();
    await settle();

    expect(result.current.save).toBe('error');
    expect(result.current.draft.questions).toHaveLength(0);
  });

  it('keeps typing usable while it is failing, and sends the newest on retry', async () => {
    apiPatch.mockRejectedValue(new Error('offline'));
    const { result } = await mount();
    act(() => result.current.setMeta({ name: 'One' }));
    await settle();
    await settle();
    expect(result.current.save).toBe('error');

    act(() => result.current.setMeta({ name: 'Two' }));
    apiPatch.mockResolvedValue({ data: template() });
    await settle();

    expect(result.current.save).toBe('saved');
    expect(apiPatch.mock.calls.at(-1)?.[1]).toMatchObject({ name: 'Two' });
  });

  it('flush() saves now rather than waiting out the debounce', async () => {
    const { result } = await mount();
    act(() => result.current.setMeta({ name: 'Now' }));
    await act(async () => { result.current.flush(); await Promise.resolve(); });
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });
});

describe('a locked template accepts no edits at all', () => {
  it('reports locked and ignores every write, so nothing can be queued behind the banner', async () => {
    const { result } = await mount(template({ readOnly: true }));
    expect(result.current.locked).toBe(true);

    act(() => result.current.setMeta({ name: 'Sneaky' }));
    act(() => result.current.addQuestion());
    await settle();

    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiPut).not.toHaveBeenCalled();
    expect(result.current.draft.name).toBe('Mid-term check');
  });
});

describe('the completion time is derived from the DRAFT, live', () => {
  it('changes as questions are added, without waiting for a save', async () => {
    const { result } = await mount();
    const before = result.current.estimatedSeconds;
    act(() => result.current.addQuestion());
    // Watching this climb past two minutes is more persuasive than an error message (37),
    // and a number that only moved after a save would make the argument a beat too late.
    expect(result.current.estimatedSeconds).toBeGreaterThan(before);
  });
});
