import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { PresetView } from '@endur/shared';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { ProgressRail } from '../../../components/flow/ProgressRail.js';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { usePresets, useSetupOrg } from '../../../lib/org.js';
import { useRefreshSession } from '../../../lib/auth.js';
import { useAppSelector } from '../../../store/index.js';
import { IndustryStep } from './steps/Industry.js';
import { RolesStep } from './steps/Roles.js';
import { StructureStep } from './steps/Structure.js';
import { WordsStep } from './steps/Words.js';
import { ReviewStep } from './steps/Review.js';
import {
  STEPS, hasEdits, labelsForWire, stepIndex, useWizard, type WizardState,
} from './useWizard.js';

// Mirrors STEPS' order in useWizard.ts — named here so the gate below reads as "the
// industry step", not as a bare 0 a reader has to cross-reference.
const INDUSTRY_STEP = 0;
const ROLES_STEP = 1;
const STRUCTURE_STEP = 2;

/**
 * Whether `Continue` may be pressed from `step`. Each step has its own minimum: an
 * industry chosen, at least two distinctly-named role levels, at least one named unit.
 * Steps 3 (words) and 4 (review) have no gate of their own — anything left blank there
 * just keeps its default.
 */
function canContinue(state: WizardState, step: number): boolean {
  if (step === INDUSTRY_STEP) return state.industry !== null;
  if (step === ROLES_STEP) {
    const names = state.roles.map((role) => role.name.trim());
    return names.length >= 2 && names.every(Boolean) &&
      new Set(names.map((name) => name.toLowerCase())).size === names.length;
  }
  if (step === STRUCTURE_STEP) return state.units.length >= 1 && state.units.every((u) => u.name.trim());
  return true;
}

const NON_TEXT_INPUTS = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image',
]);

function takesText(element: HTMLElement | null): boolean {
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === 'BUTTON' || element.tagName === 'TEXTAREA') return true;
  if (element.tagName !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has((element as HTMLInputElement).type);
}

/** Keeps a requested step index inside the wizard's actual range. */
function clampStep(index: number): number {
  return Math.max(0, Math.min(index, STEPS.length - 1));
}

export default function Setup(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const presets = usePresets();
  const commit = useSetupOrg();
  const refreshSession = useRefreshSession();
  const orgName = useAppSelector((s) => s.auth.org?.name ?? '');

  const { state, patch, applyPreset, roles, units, labels } = useWizard();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingPreset, setPendingPreset] = useState<PresetView | null>(null);

  const step = stepIndex(params.get('step') ?? 'industry');
  const goto = (index: number): void => {
    const target = STEPS[clampStep(index)];
    if (target) setParams({ step: target.key }, { replace: false });
  };

  const currentPreset = useMemo(
    () => presets.data?.find((preset) => preset.key === state.industry),
    [presets.data, state.industry],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      if (pendingPreset) return;
      const target = event.target as HTMLElement | null;
      if (takesText(target)) return;
      if (step < STEPS.length - 1 && canContinue(state, step)) goto(step + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choose = (preset: PresetView): void => {
    if (state.industry && state.industry !== preset.key && hasEdits(state, currentPreset)) {
      setPendingPreset(preset);
      return;
    }
    applyPreset(preset);
  };

  async function finish(): Promise<void> {
    if (!state.industry || saving) return;
    setSaving(true);
    setError(null);
    try {
      await commit({
        industry: state.industry,
        roles: state.roles.map((role) => ({ name: role.name.trim() })),
        units: state.units.map((unit) => ({
          tempId: unit.tempId, name: unit.name.trim(), parentTempId: unit.parentTempId,
        })),
        labels: labelsForWire(state.labels),
        includeTemplates: state.includeTemplates,
      });
      await refreshSession();
      navigate('/app?setup=done', { replace: true });
    } catch (caught) {
      setError(caught as Error);
      setSaving(false);
    }
  }

  async function skip(): Promise<void> {
    const custom = presets.data?.find((preset) => preset.key === 'custom');
    if (!custom || saving) return;
    setSaving(true);
    setError(null);
    try {
      await commit({
        industry: 'custom',
        roles: custom.roles.map((role) => ({ name: role.name })),
        units: custom.units.map((unit) => ({ ...unit })),
        labels: { ...custom.labels },
        includeTemplates: true,
      });
      await refreshSession();
      navigate('/app?setup=skipped', { replace: true });
    } catch (caught) {
      setError(caught as Error);
      setSaving(false);
    }
  }

  if (presets.loading) {
    return <p className="text-muted" aria-live="polite">Loading…</p>;
  }
  if (presets.error || !presets.data) {
    return (
      <div className="step">
        <h2 className="step-title">Setup could not load</h2>
        <p className="text-muted">
          The organization types did not load, so the wizard cannot open. Reload the page.
        </p>
      </div>
    );
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="wizard">
      <div className="wizard-top">
        <p className="utility">Setting up {orgName}</p>
        <button type="button" className="btn btn-ghost" onClick={() => void skip()} disabled={saving}>
          Skip setup →
        </button>
      </div>

      {/* The rail was built for this screen (24 §6) and was only ever mounted on the
          campaign wizard. Without it a step knows it is called "Roles" and nothing else —
          not how many are left, not that Back is a real option. */}
      <ProgressRail
        steps={[...STEPS]}
        current={step}
        onStepClick={(index) => index < step && goto(index)}
      />

      <div className="card panel wizard-panel">
      {step === 0 && (
        <IndustryStep
          presets={presets.data}
          selected={state.industry}
          onSelect={choose}
          onAdvance={() => goto(1)}
        />
      )}
      {step === 1 && (
        <RolesStep
          roles={state.roles}
          onRename={roles.rename}
          onDelete={roles.remove}
          onAdd={roles.add}
          onMove={roles.move}
          onReorder={roles.reorder}
        />
      )}
      {step === 2 && (
        <StructureStep
          units={state.units}
          unitWord={state.labels.unit.one}
          onRename={units.rename}
          onAddChild={units.addChild}
          onDelete={units.remove}
          onReparent={units.reparent}
        />
      )}
      {step === 3 && (
        <WordsStep
          labels={state.labels}
          overrides={state.pluralOverrides}
          onSetOne={labels.setOne}
          onSetMany={labels.setMany}
          onResetPlural={labels.resetPlural}
        />
      )}
      {step === 4 && (
        <ReviewStep
          roles={state.roles}
          units={state.units}
          labels={state.labels}
          preset={currentPreset}
          includeTemplates={state.includeTemplates}
          onToggleTemplates={(value) => patch({ includeTemplates: value })}
          onJump={goto}
        />
      )}

      {error && (
        <p className="form-error wizard-error" role="alert">
          {error instanceof ApiError ? error.message : 'Could not save. Nothing was changed.'}
        </p>
      )}

      {/* The panel's own floor, identical on all five steps. It used to be two loose
          buttons on the page ground a thousand pixels apart, which is why it read as
          belonging to no screen in particular. */}
      <div className="flow-bar">
        {step === 0 ? (
          <span className="flow-bar-spacer" />
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-back"
            disabled={saving}
            onClick={() => goto(step - 1)}
          >
            <Icon name="back" size={16} /> Back
          </button>
        )}

        {last ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !state.industry}
            onClick={() => void finish()}
          >
            {saving && <span className="spinner" aria-hidden="true" />}
            Finish setup
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canContinue(state, step)}
            onClick={() => goto(step + 1)}
          >
            Continue
          </button>
        )}
      </div>
      </div>

      {pendingPreset && (
        <ConfirmDialog
          title={`Switch to ${pendingPreset.displayName}?`}
          consequence={
            `This replaces the ${state.roles.length} roles, ${state.units.length} units and ` +
            `the words you have edited with ${pendingPreset.displayName}'s defaults.`
          }
          verb="Replace"
          destructive
          onConfirm={() => {
            applyPreset(pendingPreset);
            setPendingPreset(null);
          }}
          onCancel={() => setPendingPreset(null)}
        />
      )}
    </div>
  );
}
