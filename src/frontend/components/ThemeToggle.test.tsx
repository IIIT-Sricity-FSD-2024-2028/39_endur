// <ThemeToggle> — the appearance control (DEC-028).
//
// Three properties are worth pinning and none of them is "it renders three buttons".
//
//   1. The choice is THREE-valued. "System" is not "light", and a control that collapses
//      them stops tracking sunset without ever saying so.
//   2. The choice is DEVICE-scoped: localStorage, never the store or the API.
//   3. It is a real radiogroup — ONE tab stop, arrow keys between the segments. Three
//      buttons each announcing itself as part of one control is three tab stops for a
//      widget the ARIA pattern says should cost one.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle.js';

/** jsdom has no matchMedia. `theme.ts` guards for it, so this proves the guard AND lets a
 *  test say what the OS is currently doing. */
function setSystem(dark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? dark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset['theme'];
  setSystem(false);
});

describe('the three-valued choice', () => {
  it('starts on "match system", which is a default and not a selection', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Match system' }).getAttribute('aria-checked'))
      .toBe('true');
    // Nothing stored: following the OS is the absence of a choice, so there is nothing to
    // write down. A stored "system" and a missing key must not mean different things.
    expect(window.localStorage.getItem('endur.theme')).toBeNull();
  });

  it('remembers a side once one is picked, on the DEVICE', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(window.localStorage.getItem('endur.theme')).toBe('dark');
  });

  it('forgets it again when the reader goes back to the system', () => {
    window.localStorage.setItem('endur.theme', 'dark');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Match system' }));

    expect(window.localStorage.getItem('endur.theme')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('resolves "system" against the OS rather than assuming light', () => {
    setSystem(true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Match system' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});

describe('it is one control, not three buttons', () => {
  it('puts only the selected segment in the tab order', () => {
    render(<ThemeToggle />);
    const stops = screen
      .getAllByRole('radio')
      .filter((button) => button.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0]?.getAttribute('aria-label')).toBe('Match system');
  });

  it('moves and selects with the arrow keys, which is what a radiogroup promises', () => {
    render(<ThemeToggle />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('wraps at the ends rather than stopping dead', () => {
    render(<ThemeToggle />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
  });

  it('ignores keys that are not arrows, so typing does not change the theme', () => {
    render(<ThemeToggle />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'a' });
    expect(screen.getByRole('radio', { name: 'Match system' }).getAttribute('aria-checked'))
      .toBe('true');
  });
});
