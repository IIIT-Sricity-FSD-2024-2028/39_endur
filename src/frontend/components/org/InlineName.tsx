import { useEffect, useRef, useState } from 'react';

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
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const reverting = useRef(false);
  const committed = useRef(false);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);

  const commit = (): void => {
    if (reverting.current) {
      reverting.current = false;
      setDraft(value);
      onCancel?.();
      return;
    }
    const next = draft.trim();
    if (!next) {
      setDraft(value);
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
      onChange={(event) => setDraft(event.target.value)}
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
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
