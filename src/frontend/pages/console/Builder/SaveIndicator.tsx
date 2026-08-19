// The autosave indicator. 37 § Interactions, design_specs/design/05 §5.2.
//
// There is no Save button in the builder — the indicator IS the feedback, which makes it
// load-bearing rather than decorative. Its whole job is to never claim more than is true:
// `Saved` while a keystroke is still unsaved is the one lie it is capable of telling, and
// `useBuilder` is written so that state is unreachable.
//
// A failed save is the only case that gets a real error, and it appears HERE rather than as
// a toast, because it is the one thing on this screen the reader has to act on.
import type { SaveState } from './useBuilder.js';

export function SaveIndicator({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error: Error | null;
  onRetry: () => void;
}): JSX.Element | null {
  if (state === 'error') {
    return (
      <span className="save-state is-error" role="alert">
        {error?.message ?? 'That did not save.'} Your work is still here.{' '}
        <button type="button" className="btn btn-ghost" onClick={onRetry}>Try again</button>
      </span>
    );
  }

  // Nothing has happened yet. An indicator saying "Saved" on a form nobody has touched
  // would be reporting on a save that never ran.
  if (state === 'idle') return null;

  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Unsaved changes';
  return (
    <span className="save-state" role="status">{text}</span>
  );
}
