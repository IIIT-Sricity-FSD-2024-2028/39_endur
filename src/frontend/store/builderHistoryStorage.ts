// The builder's undo history in sessionStorage, so it survives a reload. Q-2, R-304.
//
// `23` §7 rules out persisting Redux state to localStorage, and this is narrower than that
// on purpose: only the HISTORY is kept (the draft itself is already autosaved to the
// server), only in this tab, and only until sign-out. On load, `templateLoaded` adopts it
// only if its present matches the draft the server returns, so a stale history can never
// overwrite a newer save.
//
// No runtime import from the builder slice: this file is reached from the store's entry
// (`middleware/sessionReset.ts` clears it on sign-out), and the slice stays in its chunk.
import type { BuilderHistory, BuilderState, Draft } from './builderSlice.js';

const PREFIX = 'endur.builder.history:';

const isDraft = (value: unknown): value is Draft =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Draft).name === 'string' &&
  typeof (value as Draft).description === 'string' &&
  Array.isArray((value as Draft).questions);

const isDrafts = (value: unknown): value is Draft[] =>
  Array.isArray(value) && value.every(isDraft);

/** The stored history for one template, or null. Storage that is full, blocked or holding
 *  something malformed is treated as empty: losing a history is better than a crash. */
export function readBuilderHistory(templateId: string): BuilderHistory | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + templateId);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<BuilderHistory>;
    if (
      value.templateId !== templateId ||
      !isDraft(value.present) ||
      !isDrafts(value.past) ||
      !isDrafts(value.future)
    ) {
      return null;
    }
    return value as BuilderHistory;
  } catch {
    return null;
  }
}

/** Keep the current template's history, or drop it once there is nothing to undo. */
export function writeBuilderHistory(state: BuilderState): void {
  if (!state.templateId) return;
  try {
    const key = PREFIX + state.templateId;
    if (state.locked || (state.past.length === 0 && state.future.length === 0)) {
      window.sessionStorage.removeItem(key);
      return;
    }
    const history: BuilderHistory = {
      templateId: state.templateId,
      past: state.past,
      present: state.draft,
      future: state.future,
    };
    window.sessionStorage.setItem(key, JSON.stringify(history));
  } catch {
    // Quota or blocked storage. The history still works for this page load.
  }
}

/** Every template's history. Called on sign-out. */
export function clearBuilderHistory(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
