// The save badge. It reads the builder slice itself rather than taking props, so it is the
// only thing that re-renders when the save state moves (idle → dirty → saving → saved).
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { saveRetried, selectSaveError, selectSaveState } from '../../../store/builderSlice.js';

export function SaveIndicator(): JSX.Element | null {
  const state = useAppSelector(selectSaveState);
  const error = useAppSelector(selectSaveError);
  const dispatch = useAppDispatch();

  if (state === 'error') {
    return (
      <span className="save-state is-error" role="alert">
        {error ?? 'That did not save.'} Your work is still here.{' '}
        <button type="button" className="btn btn-ghost" onClick={() => dispatch(saveRetried())}>
          Try again
        </button>
      </span>
    );
  }

  if (state === 'idle') return null;

  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Unsaved changes';
  return (
    <span className="save-state" role="status">{text}</span>
  );
}
