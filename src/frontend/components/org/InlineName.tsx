// Inline rename — 24 §7.
//
// "Name fields look like plain text until hovered or focused. Enter commits, Esc reverts,
// blur commits." THIS IS WHY THE LIVE DEMO IS FAST: renaming three roles must not open
// three dialogs. It is a shared behaviour rather than a prop on each caller because
// getting Esc-reverts wrong is invisible until somebody uses it on stage.
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
  /**
   * Dismissed without a value — Escape, or a blur with the field empty.
   *
   * The structure page's `+` puts an unnamed placeholder row in the tree and focuses it
   * (32 § Interactions: "two clicks, two words"). Without this the abandoned row would sit
   * there until the next refetch, looking like a unit that failed to save.
   */
  onCancel?: (() => void) | undefined;
  ariaLabel: string;
  autoFocus?: boolean;
  placeholder?: string | undefined;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  /**
   * Set by Escape, read by the blur it causes.
   *
   * `setDraft(value)` is asynchronous but `blur()` is not, so without this the blur
   * handler runs first and commits the draft the user just asked to throw away — Escape
   * SAVES instead of reverting. It was written that way, it read correctly, and it took a
   * test with a focused input to see: `.blur()` on an unfocused element is a no-op, so the
   * first version of that test passed for the wrong reason.
   */
  const reverting = useRef(false);
  /** Set by Enter, read by the blur it causes -- see `onBlur`. Same shape as `reverting`. */
  const committed = useRef(false);

  // Follow the source of truth when it changes underneath — a reorder, an undo, a preset
  // swap. Without this the input keeps showing the old name and the next blur writes it
  // straight back.
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
    // An empty name is a slip, not an instruction. Revert rather than reject with a
    // message: the previous name is right there and the user did not ask to change it.
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
        // The blur Enter just caused has nothing left to do. Without this it commits a SECOND
        // time, with the same draft both times, because `blur()` is synchronous and React has
        // not re-rendered -- so `next !== value` is still true. Renaming twice to the same
        // name hid it for as long as every caller was a rename; the structure page's `+` does
        // not rename, it CREATES, and Enter there made two units.
        if (committed.current) {
          committed.current = false;
          return;
        }
        commit();
      }}
      onFocus={() => {
        // Neither flag survives into an edit it was not set by. Both are cleared by the blur
        // they expect, and both are left standing when that blur never comes -- Escape or
        // Enter on an input nothing had focused. Clearing on the way IN closes that off
        // without either handler having to reason about whether its blur arrived.
        committed.current = false;
        reverting.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          // Committed HERE rather than left to the blur below, so Enter works on an input
          // that is not focused -- `blur()` would be a no-op and the key would do nothing.
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
