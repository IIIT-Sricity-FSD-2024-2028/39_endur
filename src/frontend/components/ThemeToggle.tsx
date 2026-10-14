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
    const box = event.currentTarget.getBoundingClientRect();
    applyWithTransition(resolve(next), {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
    });
  }, []);

  const index = SEGMENTS.findIndex((segment) => segment.choice === choice);

  const move = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
        : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = (index + step + SEGMENTS.length) % SEGMENTS.length;
      const button = groupRef.current?.querySelectorAll('button')[next];
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
