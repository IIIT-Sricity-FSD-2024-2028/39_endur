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

  if (state === 'idle') return null;

  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Unsaved changes';
  return (
    <span className="save-state" role="status">{text}</span>
  );
}
