// <Toggle> — 24 §5. `label` is REQUIRED; an unlabelled toggle is inaccessible.
//
// A real checkbox underneath, visually hidden rather than replaced. Everything a checkbox
// already does — space to toggle, form participation, the accessibility tree, forced-colours
// mode — costs nothing to keep and is expensive to rebuild badly.
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  hint?: string | undefined;
}): JSX.Element {
  return (
    <label className={`toggle${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-text">
        {label}
        {hint && <span className="text-meta toggle-hint">{hint}</span>}
      </span>
    </label>
  );
}
