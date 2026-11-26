// An inline rename. What is typed is this field's entry in `state.widgets.names`
// (store/screens/widgets.ts), with the value it started from; once the value itself changes,
// the field shows the new one. The commit is the caller's (`onCommit`, a thunk there).
import { useEffect, useId, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { useClearOnLeave } from '../../store/screens/common.js';
import { instanceLeft, nameReset, nameTyped, selectNameShown } from '../../store/screens/widgets.js';

export function InlineName({
  value,
  onCommit,
  onCancel,
  ariaLabel,
  autoFocus = false,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel?: (() => void) | undefined;
  ariaLabel: string;
  autoFocus?: boolean;
  placeholder?: string | undefined;
}): JSX.Element {
  const id = useId();
  const dispatch = useAppDispatch();
  const draft = useAppSelector((state) => selectNameShown(state, id, value));
  useClearOnLeave(instanceLeft({ id }));
  const ref = useRef<HTMLInputElement>(null);
  const reverting = useRef(false);
  const committed = useRef(false);
  const revert = (): void => {
    dispatch(nameReset({ id }));
  };

  // Effect (DOM): focus and select the field when asked to.

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);

  const commit = (): void => {
    if (reverting.current) {
      reverting.current = false;
      revert();
      onCancel?.();
      return;
    }
    const next = draft.trim();
    if (!next) {
      revert();
      onCancel?.();
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <input
      ref={ref}
      className="inline-name"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => dispatch(nameTyped({ id, text: event.target.value, base: value }))}
      onBlur={() => {
        if (committed.current) {
          committed.current = false;
          return;
        }
        commit();
      }}
      onFocus={() => {
        committed.current = false;
        reverting.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          committed.current = true;
          commit();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          reverting.current = true;
          revert();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
