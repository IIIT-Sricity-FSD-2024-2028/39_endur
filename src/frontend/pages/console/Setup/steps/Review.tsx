// Step 5 — review. 31 § Interactions, design_specs/design/03 §3.4.
//
// Four summary cards, each with a pencil back to its step. The cards state NUMBERS, not
// reassurance: "5 units, 3 deep" is checkable at a glance, "your structure is ready" is not.
import type { PresetView, ResolvedLabels } from '@endur/shared';
import { Icon } from '../../../../components/Icon.js';
import { Toggle } from '../../../../components/form/Toggle.js';
import { pluralise } from '../../../../lib/format.js';
import { depthOf, type RoleDraft, type UnitDraft } from '../useWizard.js';
import { DashboardPreview } from '../../../../components/org/DashboardPreview.js';

function Card({
  kicker,
  step,
  onJump,
  children,
}: {
  kicker: string;
  step?: number;
  onJump?: (step: number) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="card review-card">
      <div className="review-head">
        <p className="utility">{kicker}</p>
        {step !== undefined && onJump && (
          <button type="button" className="btn btn-icon" onClick={() => onJump(step)}>
            <Icon name="edit" size={16} label={`Edit ${kicker.toLowerCase()}`} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function ReviewStep({
  roles,
  units,
  labels,
  preset,
  includeTemplates,
  onToggleTemplates,
  onJump,
}: {
  roles: RoleDraft[];
  units: UnitDraft[];
  labels: ResolvedLabels;
  preset: PresetView | undefined;
  includeTemplates: boolean;
  onToggleTemplates: (value: boolean) => void;
  onJump: (step: number) => void;
}): JSX.Element {
  const templates = preset?.templates ?? [];

  return (
    <div className="step">
      <h2 className="step-title">Ready to go.</h2>
      <p className="step-lede">Everything below stays editable afterwards.</p>

      <div className="review-grid">
        <Card kicker="Roles" step={1} onJump={onJump}>
          <p className="review-figure">{pluralise(roles.length, 'level', 'levels')}</p>
          {/* Arrow, not `+` — DEC-085. These are LEVELS: ordered, each seeing strictly less
              than the one before, which is the entire content of the "Sees…" column two
              steps back. `Dean + Head + Tutor` reads as an unordered set and loses it. */}
          <p className="text-meta">{roles.map((role) => role.name).join(' → ')}</p>
        </Card>

        <Card kicker="Structure" step={2} onJump={onJump}>
          <p className="review-figure">
            {pluralise(units.length, 'unit', 'units')}, {depthOf(units)} deep
          </p>
          <p className="text-meta">{units[0]?.name}</p>
        </Card>

        <Card kicker="Official Terms" step={3} onJump={onJump}>
          <p className="review-figure review-words">
            {[labels.unit.one, labels.subject.one, labels.respondent.one, labels.reviewee.one]
              .join(' · ')}
          </p>
        </Card>

        <Card kicker="Starter templates">
          {templates.length > 0 ? (
            <>
              <Toggle
                checked={includeTemplates}
                onChange={onToggleTemplates}
                label={`Add ${pluralise(templates.length, 'template', 'templates')}`}
              />
              <p className="text-meta">{templates.map((template) => template.name).join(', ')}</p>
            </>
          ) : (
            <p className="text-meta">None in this preset. You&rsquo;ll build your own.</p>
          )}
        </Card>
      </div>

      <DashboardPreview labels={labels} kicker="This is how your dashboard will look" />
    </div>
  );
}

