// Loads a template into the builder. 37 § State; docs/REDUX-PLAN.md §6.7 (R-305), §6.10.
//
// The draft, its save state and its undo history live in `store/builderSlice.ts`; whether
// the template has loaded, and why not, is `store/screens/builderPage.ts`. The page reads
// both with `useAppSelector`. What is left here is when: open the template on arriving
// (the `builderOpened` thunk), and on leaving let go of it and save what is pending.
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { builderLeft } from '../../../store/builderSlice.js';
import { pageErrorOf } from '../../../store/screens/common.js';
import { builderOpened, builderPageLeft, selectBuilderPage } from '../../../store/screens/builderPage.js';
// Both register their listeners on import, and only the builder needs them.
import '../../../store/middleware/autosave.js';
import '../../../store/middleware/builderHistory.js';

export type { Draft, SaveState } from '../../../store/builderSlice.js';
export { toDraft } from '../../../store/screens/builderPage.js';

export type BuilderLoad = {
  loading: boolean;
  /** The load failed. Distinct from a SAVE failure, which never costs the reader anything. */
  loadError: Error | null;
  ready: boolean;
};

export function useBuilder(id: string | undefined): BuilderLoad {
  const dispatch = useAppDispatch();
  const page = useAppSelector(selectBuilderPage);

  // Effect (lifecycle): opening loads the template into the builder slice; leaving saves what is pending and clears it.

  useEffect(() => {
    if (!id) return undefined;
    const release = dispatch(builderOpened(id));
    return () => {
      release();
      // Save anything pending NOW, while the slice still holds this template. Waiting out
      // the debounce would race the next template's load.
      dispatch(builderLeft());
      dispatch(builderPageLeft());
    };
  }, [id, dispatch]);

  const current = page.templateId === id;
  return {
    loading: !current || page.load === 'loading',
    loadError: current ? pageErrorOf(page.loadError) : null,
    ready: current && page.load === 'ready',
  };
}
