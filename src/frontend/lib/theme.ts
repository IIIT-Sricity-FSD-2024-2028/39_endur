// Light / dark, and the transition between them (DEC-028).
//
// Theme is a property of the DEVICE, not of the session or the organisation, so it lives in
// localStorage and never touches the store or the API. Someone signing in on a shared
// machine does not carry their theme to the next person's account, and the console renders
// correctly before `useBootSession()` has resolved.
//
// Three states, not two. "system" is the default and means "keep following the OS", which is
// a different thing from having chosen light — a laptop that flips to dark at sunset should
// take the product with it unless the user has said otherwise.

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'endur.theme';

/** The same key and the same logic run in the inline boot script in index.html. If this
 *  changes, that changes with it — the two exist to agree, and a mismatch shows up as a
 *  flash of the wrong theme on first paint, which no test will catch. */
export function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Private browsing, or storage disabled. Following the OS is the right fallback.
  }
  return 'system';
}

export function systemTheme(): ResolvedTheme {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? systemTheme() : choice;
}

/** The single place the attribute is written. tokens.css keys every colour off it. */
export function apply(theme: ResolvedTheme): void {
  document.documentElement.dataset['theme'] = theme;
}

export function persist(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Non-fatal: the theme still applies for this tab, it just will not be remembered.
  }
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Supported = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

/**
 * Swap the theme with a circle that opens from the control that was clicked.
 *
 * The View Transitions API is what makes this one repaint rather than a thousand
 * simultaneous CSS transitions — the browser screenshots the old page, we swap the
 * attribute, and the new page is revealed through an expanding clip-path. Every element
 * changes colour at once and nothing tears.
 *
 * Everything about the effect is optional. Without the API, or under reduced-motion, the
 * attribute is simply set and the theme changes instantly; that is a plain product, not a
 * broken one. `origin` is where the circle starts — pass the toggle's centre so the light
 * appears to come from the thing that was pressed.
 */
export function applyWithTransition(theme: ResolvedTheme, origin?: { x: number; y: number }): void {
  const doc = document as Supported;

  if (prefersReducedMotion() || typeof doc.startViewTransition !== 'function') {
    apply(theme);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  // The circle has to cover the furthest corner or the old theme is left in a corner of the
  // screen. Radius is the hypotenuse from the origin to whichever corner is furthest away.
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = doc.startViewTransition(() => apply(theme));

  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 620,
        // Slow out rather than slow in: the reveal should feel like it is settling into
        // place, not accelerating away. Matches --ease in endur.css.
        easing: 'cubic-bezier(.2, .8, .25, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  });
}
