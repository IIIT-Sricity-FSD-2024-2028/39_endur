// The appearance control (DEC-028). 24 §2.
//
// Three segments rather than one switch, because the choice is genuinely three-valued and a
// two-state switch has to lie about one of them: a device following the OS is not "light",
// it is "whatever the OS says", and collapsing that into the sun makes the product stop
// tracking sunset without ever saying so.
//
// The indicator slides between segments rather than appearing under the new one. It is the
// only moving part, and it is what tells you the three are one control and not three
// buttons that happen to be adjacent.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon.js';
import {
  applyWithTransition,
  persist,
  readChoice,
  resolve,
  type ThemeChoice,
} from '../lib/theme.js';

const SEGMENTS: ReadonlyArray<{ choice: ThemeChoice; icon: IconName; label: string }> = [
  { choice: 'light', icon: 'light', label: 'Light' },
  { choice: 'system', icon: 'theme-system', label: 'Match system' },
  { choice: 'dark', icon: 'dark', label: 'Dark' },
];

export function ThemeToggle({ className }: { className?: string }): JSX.Element {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice());
  const groupRef = useRef<HTMLDivElement>(null);

  // Only while the choice IS "system". Once someone picks a side, the OS flipping at sunset
  // must not overrule them — that is the difference between a default and a setting.
  useEffect(() => {
    if (choice !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyWithTransition(resolve('system'));
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  const pick = useCallback((next: ThemeChoice, event: React.MouseEvent<HTMLButtonElement>) => {
    setChoice(next);
    persist(next);
    // The circle opens from the segment that was pressed, so the new theme looks like it
    // came out of the control rather than being dropped over the page.
    const box = event.currentTarget.getBoundingClientRect();
    applyWithTransition(resolve(next), {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    });
  }, []);

  const index = SEGMENTS.findIndex((segment) => segment.choice === choice);

  /**
   * Arrow keys move between the segments, and only the SELECTED one is in the tab order.
   *
   * That is not polish, it is what `role="radiogroup"` promises. Three buttons each with
   * `tabIndex=0` are three tab stops that announce themselves as one control, so a keyboard
   * reader tabs three times to get past a widget the pattern says should cost one — and the
   * arrow keys they reach for instead do nothing at all. The `.segmented` controls elsewhere
   * in the product get this free from real radio inputs; this one is buttons, because each
   * segment is an icon with a label rather than a word, so it has to be written out.
   */
  const move = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
        : 0;
      if (step === 0) return;
      event.preventDefault();
      // Wraps, as the pattern specifies: three segments make the ends adjacent anyway.
      const next = (index + step + SEGMENTS.length) % SEGMENTS.length;
      const button = groupRef.current?.querySelectorAll('button')[next];
      // Selection follows focus here — the control has three states and no submit step, so
      // arrowing onto a segment IS choosing it, and the wipe starts from that segment.
      button?.click();
      button?.focus();
    },
    [index],
  );

  return (
    <div
      ref={groupRef}
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      role="radiogroup"
      aria-label="Appearance"
      onKeyDown={move}
    >
      {/* Behind the buttons, not between them: a sibling that participates in hit-testing
          would eat the click on whichever segment it happens to be sitting over. */}
      <span
        className="theme-toggle-thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {SEGMENTS.map((segment) => (
        <button
          key={segment.choice}
          type="button"
          role="radio"
          aria-checked={segment.choice === choice}
          aria-label={segment.label}
          title={segment.label}
          tabIndex={segment.choice === choice ? 0 : -1}
          className="theme-toggle-seg"
          onClick={(event) => pick(segment.choice, event)}
        >
          <Icon name={segment.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
