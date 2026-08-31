import { useEffect } from 'react';
import type { PresetView } from '@endur/shared';
import { Icon, type IconName } from '../../../../components/Icon.js';

// Typed to the union, not to `string`: `IconName` is the agreed vocabulary (24 §1), and a
// `Record<string, string>` here is what let a name that does not exist compile.
const PRESET_ICONS: Record<string, IconName> = {
  university: 'university',
  hotel: 'hotel',
  hospital: 'hospital',
  company: 'organization',
  custom: 'settings',
};

/** Industries the vibe system has a colour pair for (`endur.css` "the switch"). Matches
 *  `AppShell.tsx`'s set — `custom` has no swatch and stays the base blue accent. */
const VIBE_INDUSTRIES = new Set(['university', 'hotel', 'hospital', 'company']);

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

  // Preview the theme live as the org type is picked — same mechanism Landing.tsx's demo
  // switcher uses. `AppShell` takes over from `organization.industry` once setup finishes;
  // this just lets the pick double as a "choose your colour" control before that exists.
  useEffect(() => {
    if (selected && VIBE_INDUSTRIES.has(selected)) {
      document.documentElement.dataset.vibe = selected;
    } else {
      delete document.documentElement.dataset.vibe;
    }
    return () => {
      delete document.documentElement.dataset.vibe;
    };
  }, [selected]);

  return (
    <div className="step step-split">
      <div className="step-split-main">
        <h2 className="step-title">What kind of organization is this?</h2>
        <p className="step-lede">
          We&rsquo;ll pre-fill roles, structure and vocabulary. You can change all of it in the
          next three steps.
        </p>
        {/* Restored at DEC-085. `31` § step 1 argues this line in prose and it is the whole
            answer to the question every unlisted organisation asks first. Without it the
            five cards read as an exhaustive list and a clinic, a charity or a bus company
            sees no row for itself — on the one screen whose entire subject is that the
            model does not care (INV-002). "Custom" alone does not say it: it reads as the
            hard path, not as the reassurance that the preset is only a starting point. */}
        <p className="step-lede step-lede-aside">
          Nothing here exactly? Pick the closest one — every role and every word is yours to
          change, and none of this is locked in afterwards.
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
              {VIBE_INDUSTRIES.has(preset.key) && (
                <span
                  className={`preset-swatch preset-swatch-${preset.key}`}
                  aria-hidden="true"
                  title="Theme colour for this organization type"
                />
              )}
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
                    {idx > 0 && <Icon name="chevron" size={16} className="preset-org-arrow" />}
                    <div className="preset-org-bubble">{role.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="preset-sidebar-section">
              <h4 className="preset-sidebar-heading">Terminology</h4>
              {/* "Unit:" and "Respondent:" until 29 Aug, which broke INV-001 on the one
                  screen whose entire subject is that the vocabulary is yours to choose.
                  Those are Endur's INTERNAL names for the two concepts (INV-002) —
                  nothing in the product says them to a reader, and `<VocabularyChips>`
                  makes the same point by printing the words alone with no category label
                  at all. The left side is now a description of the concept; the right
                  side is the preset's data, which is the only half that was ever right. */}
              <div className="preset-terms">
                <div className="preset-term">
                  <span className="preset-term-label">Each part of it is a</span>
                  <span className="preset-term-value">{selectedPreset.labels['unit']?.one ?? '—'}</span>
                </div>
                <div className="preset-term">
                  <span className="preset-term-label">Each person who answers is a</span>
                  <span className="preset-term-value">{selectedPreset.labels['respondent']?.one ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="preset-sidebar-empty">
            <Icon name="structure" size={24} />
            <p>Select an organization type to preview its structure and terminology.</p>
          </div>
        )}
      </div>
    </div>
  );
}
