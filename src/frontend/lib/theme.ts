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
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

/**
 * How far the wipe's soft edge is spread, in px. Duplicated from --wipe-feather
 * in endur.css because the radius computed here has to include it: a circle
 * sized to the furthest corner stops one feather short once the edge is soft,
 * and the last sliver of the old theme is left sitting in the corner.
 */
const FEATHER_PX = 120;

/**
 * Swap the theme with a soft-edged circle that opens from the control that was clicked.
 *
 * The View Transitions API is what makes this one repaint rather than a thousand
 * simultaneous CSS transitions — the browser screenshots the old page, we swap the
 * attribute, and the new page is revealed through an expanding radial mask. Every element
 * changes colour at once and nothing tears.
 *
 * This function only publishes the geometry: the origin, and how far the mask has to
 * travel. The animation itself is declared in endur.css against
 * `.is-theme-wiping::view-transition-new(root)`, so it runs on the compositor instead of
 * being driven from here — which is the difference between a wipe that holds its frame rate
 * over a full-screen snapshot and one that stutters whenever the main thread is busy. The
 * edge is feathered rather than cut, for the reason recorded beside that rule.
 *
 * Everything about the effect is optional. Without the API, or under reduced-motion, the
 * attribute is simply set and the theme changes instantly; that is a plain product, not a
 * broken one. `origin` is where the circle starts — pass the toggle's centre so the light
 * appears to come from the thing that was pressed.
 */
export function applyWithTransition(theme: ResolvedTheme, origin?: { x: number; y: number }): void {
  const doc = document as Supported;
  const root = document.documentElement;

  // Arrowing across the toggle re-picks a choice that resolves to the theme already on
  // screen — "system" onto a dark laptop, say. Wiping one theme over the identical theme
  // is 620ms of nothing, and it reads as lag in the control rather than as a no-op.
  if (root.dataset['theme'] === theme) return;

  if (prefersReducedMotion() || typeof doc.startViewTransition !== 'function') {
    apply(theme);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  // The circle has to cover the furthest corner or the old theme is left in a corner of the
  // screen. Radius is the hypotenuse from the origin to whichever corner is furthest away,
  // plus the feather, which is spent on the tail rather than on covering anything.
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  root.style.setProperty('--wipe-x', `${x}px`);
  root.style.setProperty('--wipe-y', `${y}px`);
  root.style.setProperty('--wipe-span', `${Math.round(radius) + FEATHER_PX}px`);
  root.classList.add('is-theme-wiping');

  const transition = doc.startViewTransition(() => apply(theme));

  // Both settle paths, and both are load-bearing. `finished` rejects when a second click
  // skips this transition mid-flight, and an unhandled rejection there would surface as a
  // console error on nothing worse than an impatient reader; leaving the class on would
  // mask the NEXT swap with a stale origin.
  const settle = (): void => {
    root.classList.remove('is-theme-wiping');
    root.style.removeProperty('--wipe-x');
    root.style.removeProperty('--wipe-y');
    root.style.removeProperty('--wipe-span');
  };
  void transition.finished.then(settle, settle);
}
