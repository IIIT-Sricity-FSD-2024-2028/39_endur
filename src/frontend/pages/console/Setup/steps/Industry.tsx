// Step 1 — the 90 seconds start here. 31 § Interactions, design_specs/design/03 §3.4.
//
// Each card shows the ROLE CHAIN and the VOCABULARY PAIR up front. That is what makes the
// choice take four seconds instead of four clicks: you can see what you are getting without
// opening anything.
import type { PresetView } from '@endur/shared';
import { Icon } from '../../../../components/Icon.js';

export function IndustryStep({
  presets,
  selected,
  onSelect,
  onAdvance,
}: {
  presets: PresetView[];
  selected: string | null;
  onSelect: (preset: PresetView) => void;
  onAdvance: () => void;
}): JSX.Element {
  return (
    <div className="step">
      <h2 className="step-title">What kind of organization is this?</h2>
      <p className="step-lede">
        We&rsquo;ll pre-fill roles, structure and vocabulary. You can change all of it in the
        next three steps.
      </p>

      <div className="preset-grid" role="radiogroup" aria-label="Organization type">
        {presets.map((preset) => (
          <label
            className={`preset-card${selected === preset.key ? ' is-selected' : ''}`}
            key={preset.key}
            onDoubleClick={() => {
              // Double-click selects AND advances. Four seconds becomes two for anybody
              // who has run the demo before.
              onSelect(preset);
              onAdvance();
            }}
          >
            <input
              type="radio"
              name="industry"
              value={preset.key}
              checked={selected === preset.key}
              onChange={() => onSelect(preset)}
            />
            {selected === preset.key && (
              <span className="preset-check" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            )}
            <span className="preset-name">{preset.displayName}</span>

            <span className="preset-chain text-meta">
              {preset.roles.map((role) => role.name).join(' → ')}
            </span>

            <span className="preset-words text-meta">
              {[preset.labels['unit']?.one, preset.labels['respondent']?.one]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </label>
        ))}
      </div>

      {/*
        The presenter's script, on the screen, where it cannot be forgotten. When an
        evaluator names something unlisted — a gym, an NGO, a school district — the answer
        is out loud and immediate: a gym is a Company, and the preset is a starting
        position rather than a category.
      */}
      <p className="step-note text-meta">
        Not listed? Pick the closest one — you&rsquo;ll rename everything in the next three
        steps anyway.
      </p>
    </div>
  );
}
