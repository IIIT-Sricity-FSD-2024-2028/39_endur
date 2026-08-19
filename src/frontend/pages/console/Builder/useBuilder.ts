// The builder's draft and its autosave. 37 § State, § Interactions.
//
// Page-local and deliberately NOT in redux (`23` §2: one route's transient state). In P3
// this becomes `builderSlice` with an undo stack, which is the reducer work that makes the
// Redux phase substantive — so it is written here as a reducer already, over one immutable
// draft object, rather than as a dozen `useState`s that would have to be untangled first.
//
// THE ONE RULE THIS FILE EXISTS TO KEEP: **never discard typed input.** Not on a failed
// save, not on a retry, not on a save that lands while the reader is still typing. Every
// decision below falls out of that.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PutQuestionsBody, TemplateDetail, UpdateTemplateBody } from '@endur/shared';
import { estimateSeconds } from '@endur/shared';
import { apiGet, apiPatch, apiPut } from '../../../lib/api.js';
import { defaultConfig, type QuestionDraft } from '../../../components/form/kinds.js';

/** 37 § State fixes this. Long enough to swallow a burst of typing, short enough that
 *  "Saved" appears before somebody wonders whether it did. */
const DEBOUNCE_MS = 800;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type Draft = {
  name: string;
  description: string;
  questions: QuestionDraft[];
};

export type Builder = {
  loading: boolean;
  /** The load failed. Distinct from a SAVE failure, which never costs the reader anything. */
  loadError: Error | null;
  template: TemplateDetail | null;
  draft: Draft;
  save: SaveState;
  saveError: Error | null;
  /** True once a launched campaign uses it — every control goes read-only (37 § States). */
  locked: boolean;
  /** Derived live from the draft, never from the server's stored value while editing. */
  estimatedSeconds: number;
  setMeta: (patch: Partial<Pick<Draft, 'name' | 'description'>>) => void;
  setQuestions: (questions: QuestionDraft[]) => void;
  addQuestion: () => void;
  /** Force a save now — the manual retry after a failure. */
  flush: () => void;
};

const EMPTY: Draft = { name: '', description: '', questions: [] };

const toDraft = (template: TemplateDetail): Draft => ({
  name: template.name,
  description: template.description ?? '',
  // `position` is dropped here and never sent: it is derived from array order on save
  // (37), and a client-supplied position that disagrees with the array is silently wrong.
  questions: template.questions.map((question) => ({
    id: question.id,
    kind: question.kind,
    text: question.text,
    config: question.config,
    required: question.required,
  })),
});

export function useBuilder(id: string | undefined): Builder {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [save, setSave] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<Error | null>(null);

  /**
   * What is dirty, tracked separately because they are two endpoints — `PATCH` for the
   * meta, `PUT` for the whole question set (37 § Data contract). Renaming a form must not
   * rewrite its questions.
   */
  const dirty = useRef<{ meta: boolean; questions: boolean }>({ meta: false, questions: false });
  /** Read by the save; always the newest, never the value captured when the timer was set. */
  const latest = useRef<Draft>(EMPTY);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);
  /** One automatic retry, then the reader gets a button. Retrying forever hides the fault. */
  const retried = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    void apiGet<{ data: TemplateDetail }>(`/templates/${id}`)
      .then((response) => {
        if (cancelled) return;
        setTemplate(response.data);
        const next = toDraft(response.data);
        latest.current = next;
        setDraft(next);
        setLoading(false);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLoadError(error);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const locked = template?.readOnly ?? false;

  const persist = useCallback(async () => {
    if (!id) return;
    const pending = { ...dirty.current };
    if (!pending.meta && !pending.questions) return;

    setSave('saving');
    setSaveError(null);
    // Cleared BEFORE the request, not after. An edit made while the request is in flight
    // must mark the draft dirty again rather than being swallowed by a late success.
    dirty.current = { meta: false, questions: false };
    const sending = latest.current;

    try {
      if (pending.meta) {
        await apiPatch<UpdateTemplateBody, { data: TemplateDetail }>(`/templates/${id}`, {
          name: sending.name.trim() || 'Untitled form',
          description: sending.description,
        });
      }
      if (pending.questions) {
        // The whole set, in one transaction. The builder autosaves a DOCUMENT, not a
        // stream of field edits, and reordering is one operation on an array (37).
        await apiPut<PutQuestionsBody, { data: TemplateDetail }>(`/templates/${id}/questions`, {
          questions: sending.questions,
        });
      }
      if (!alive.current) return;
      retried.current = false;
      // Still dirty means somebody typed during the request — say `dirty`, not `saved`,
      // because "Saved" over an unsaved keystroke is the one lie this indicator can tell.
      setSave(dirty.current.meta || dirty.current.questions ? 'dirty' : 'saved');
    } catch (error) {
      if (!alive.current) return;
      // THE DRAFT IS UNTOUCHED. Nothing here reads from the server or resets state — a
      // failed save costs the reader nothing but a retry (37 § Interactions).
      dirty.current = {
        meta: dirty.current.meta || pending.meta,
        questions: dirty.current.questions || pending.questions,
      };
      if (!retried.current) {
        retried.current = true;
        setSave('dirty');
        schedule();
        return;
      }
      setSave('error');
      setSaveError(error as Error);
    }
    // `schedule` is declared below and is deliberately NOT a dependency: it depends on this
    // callback in turn, so listing it would make the pair rebuild on every render and
    // restart the debounce each time. Both are stable for the life of one template id.
  }, [id]);

  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), DEBOUNCE_MS);
  }, [persist]);

  const touch = useCallback(
    (what: 'meta' | 'questions', next: Draft) => {
      if (locked) return;
      latest.current = next;
      setDraft(next);
      dirty.current[what] = true;
      setSave('dirty');
      schedule();
    },
    [locked, schedule],
  );

  const setMeta = useCallback(
    (patch: Partial<Pick<Draft, 'name' | 'description'>>) => {
      touch('meta', { ...latest.current, ...patch });
    },
    [touch],
  );

  const setQuestions = useCallback(
    (questions: QuestionDraft[]) => {
      touch('questions', { ...latest.current, questions });
    },
    [touch],
  );

  const addQuestion = useCallback(() => {
    // A new question starts as a rating: it is the most common kind in every seeded
    // template, and starting somewhere is faster than starting at a chooser.
    const question: QuestionDraft = {
      kind: 'rating',
      text: '',
      config: defaultConfig('rating'),
      required: false,
    };
    touch('questions', { ...latest.current, questions: [...latest.current.questions, question] });
  }, [touch]);

  const flush = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    retried.current = true;
    void persist();
  }, [persist]);

  return {
    loading,
    loadError,
    template,
    draft,
    save,
    saveError,
    locked,
    // Live, from the draft — the number is the argument against a forty-question form, and
    // one that only updated after a save would make that argument a beat too late (37).
    estimatedSeconds: estimateSeconds(draft.questions.map((question) => question.kind)),
    setMeta,
    setQuestions,
    addQuestion,
    flush,
  };
}
