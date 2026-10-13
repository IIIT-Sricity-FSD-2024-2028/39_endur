
export function AmbientBackground({
  variant = 'default',
}: {
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
