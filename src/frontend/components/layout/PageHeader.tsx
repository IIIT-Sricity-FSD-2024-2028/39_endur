import type { ReactNode } from 'react';
import { VocabularyChips } from './VocabularyChips.js';

export type FilterChip = { label: string; onClear?: () => void };

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
