// Every console page opens with this, which is what makes differently-shaped screens feel
// like one product. design_specs/design/02 §3, 24 §2.
import type { ReactNode } from 'react';
import { VocabularyChips } from './VocabularyChips.js';

export type FilterChip = { label: string; onClear?: () => void };

/**
 * The unit-scope chip. A DROPDOWN for a top-level role, a plain non-interactive tag for a
 * constrained one — so the constraint is legible rather than mysterious
 * (design_specs/design/02 §5). `options` absent means fixed.
 */
export type ScopeChip = {
  label: string;
  options?: Array<{ id: string; label: string }>;
  onChange?: (id: string) => void;
  value?: string;
};

export function PageHeader({
  title,
  subtitle,
  vocabulary = true,
  filters,
  scope,
  action,
}: {
  title: string;
  subtitle?: string | undefined;
  /** The chip row is on by default. Turn it off only where it would be noise — the
   *  wizard, which is teaching the vocabulary rather than reporting it. */
  vocabulary?: boolean;
  filters?: FilterChip[];
  scope?: ScopeChip;
  action?: ReactNode;
}): JSX.Element {
  return (
    <header className="page-header">
      <div className="page-header-top">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="page-header-sub">{subtitle}</p>}
        </div>
        {action && <div className="page-header-action">{action}</div>}
      </div>

      <div className="page-header-chips">
        {vocabulary && <VocabularyChips />}
        {scope && <Scope {...scope} />}
        {filters?.map((filter) => (
          <span className="tag tag-outline" key={filter.label}>
            {filter.label}
            {filter.onClear && (
              <button
                type="button"
                className="tag-clear"
                onClick={filter.onClear}
                aria-label={`Clear filter ${filter.label}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    </header>
  );
}

function Scope({ label, options, onChange, value }: ScopeChip): JSX.Element {
  // Fixed scope: a tag, visibly NOT a control. Rendering a disabled dropdown would suggest
  // the choice exists and is being withheld, which is the opposite of legible.
  if (!options || options.length === 0) {
    return <span className="tag tag-neutral">Scope: {label}</span>;
  }

  return (
    <label className="scope-select">
      <span className="sr-only">Scope</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            Scope: {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
