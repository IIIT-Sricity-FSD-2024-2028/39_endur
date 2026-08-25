// The ambient layer (DEC-029). 24 §2.
//
// Every surface in the product is translucent, and a blur with nothing behind it is just a
// grey rectangle. This gives the glass a static field of colour to refract instead.
//
// It is `aria-hidden` and `pointer-events: none`: it is wallpaper, not content.

export function AmbientBackground({
  variant = 'default',
}: {
  /** `hero` turns the colour fields up for the landing page, where the ambient layer is
   *  part of the composition rather than something the console sits quietly on top of. */
  variant?: 'default' | 'hero';
}): JSX.Element {
  return (
    <div className={`ambient ambient-${variant}`} aria-hidden="true">
      {/* Five fields, each anchored past a viewport edge and oversized, so what reaches the
          middle of the screen is their falloff rather than their boundary and the whole
          ground is covered — a gap between fields shows the flat page colour through, and
          the glass then has nothing to refract. */}
      <span className="ambient-field ambient-field-1" />
      <span className="ambient-field ambient-field-2" />
      <span className="ambient-field ambient-field-3" />
      <span className="ambient-field ambient-field-4" />
      <span className="ambient-field ambient-field-5" />
    </div>
  );
}
