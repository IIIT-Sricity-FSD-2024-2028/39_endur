// Loads a template into the builder. 37 § State; docs/REDUX-PLAN.md §6.7 (R-305).
//
// The draft, its save state and its undo history live in `store/builderSlice.ts`, and the
// page reads and writes them directly with `useAppSelector` and `useAppDispatch` (§7: the
// `lib` seam is for server data; client state is the slice's). What is left here is the
// server half: fetch the template, hand it to the slice, and say when the page leaves.
// The fetch is RTK Query's `getTemplate`, through `openTemplate` (R-201).
import { useEffect, useState } from 'react';
import type { TemplateDetail } from '@endur/shared';
import { openTemplate } from '../../../lib/templates.js';
import { useAppDispatch } from '../../../store/index.js';
import { builderLeft, templateLoaded, type Draft } from '../../../store/builderSlice.js';
import { readBuilderHistory } from '../../../store/builderHistoryStorage.js';
// Both register their listeners on import, and only the builder needs them.
import '../../../store/middleware/autosave.js';
import '../../../store/middleware/builderHistory.js';

export type { Draft, SaveState } from '../../../store/builderSlice.js';

export type BuilderLoad = {
  loading: boolean;
  /** The load failed. Distinct from a SAVE failure, which never costs the reader anything. */
  loadError: Error | null;
  template: TemplateDetail | null;
};

export const toDraft = (template: TemplateDetail): Draft => ({
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

export function useBuilder(id: string | undefined): BuilderLoad {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const { loaded, release } = openTemplate(dispatch, id);
    void loaded
      .then((detail) => {
        if (cancelled) return;
        setTemplate(detail);
        dispatch(
          templateLoaded({
            id,
            draft: toDraft(detail),
            locked: detail.readOnly,
            history: readBuilderHistory(id),
          }),
        );
        setLoading(false);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setLoadError(error);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      release();
      // Save anything pending NOW, while the slice still holds this template. Waiting out
      // the debounce would race the next template's load.
      dispatch(builderLeft());
    };
  }, [id, dispatch]);

  return { loading, loadError, template };
}
