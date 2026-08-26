import type { PresetView } from '@endur/shared';
import { Icon } from '../../../../components/Icon.js';

const PRESET_ICONS: Record<string, string> = {
  university: 'university',
  hotel: 'hotel',
  hospital: 'hospital',
  company: 'organization',
  custom: 'settings',
};

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
  const selectedPreset = presets.find((p) => p.key === selected);

  return (
    <div className="step step-split">
      <div className="step-split-main">
        <h2 className="step-title">What kind of organization is this?</h2>
        <p className="step-lede">
          We&rsquo;ll pre-fill roles, structure and vocabulary. You can change all of it in the
          next three steps.
        </p>

        <div className="preset-grid" role="radiogroup" aria-label="Organization type">
          {presets.map((preset) => (
            <label
              className={`preset-card preset-card-simple${selected === preset.key ? ' is-selected' : ''}`}
              key={preset.key}
              onDoubleClick={() => {
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
              <div className="preset-card-icon">
                <Icon name={PRESET_ICONS[preset.key] || 'organization'} size={24} />
              </div>
              <span className="preset-name">{preset.displayName}</span>
              {selected === preset.key && (
                <span className="preset-check" aria-hidden="true">
                  <Icon name="check" size={16} />
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="step-split-aside">
        {selectedPreset ? (
          <div className="preset-sidebar">
            <h3 className="preset-sidebar-title">{selectedPreset.displayName} Structure</h3>
            
            <div className="preset-sidebar-section">
              <h4 className="preset-sidebar-heading">Roles</h4>
              <div className="preset-org-chart">
                {selectedPreset.roles.map((role, idx) => (
                  <div key={role.name} className="preset-org-node">
                    {idx > 0 && <Icon name="chevron" size={14} className="preset-org-arrow" />}
                    <div className="preset-org-bubble">{role.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="preset-sidebar-section">
              <h4 className="preset-sidebar-heading">Terminology</h4>
              <div className="preset-terms">
                <div className="preset-term">
                  <span className="preset-term-label">Unit:</span>
                  <span className="preset-term-value">{selectedPreset.labels['unit']?.one || 'None'}</span>
                </div>
                <div className="preset-term">
                  <span className="preset-term-label">Respondent:</span>
                  <span className="preset-term-value">{selectedPreset.labels['respondent']?.one || 'None'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="preset-sidebar-empty">
            <Icon name="structure" size={32} />
            <p>Select an organization type to preview its structure and terminology.</p>
          </div>
        )}
      </div>
    </div>
  );
}
