// T-032 — the setup wizard. 31, design_specs/design/03 §3.4-3.5.
//
// **The screen the evaluation is actually about.** 02 §2 lists four things that are never
// cut and this is the first. Target: 90 seconds from an evaluator saying "a gym" to a
// working organisation, and every decision below serves that number.
//
// Three properties are load-bearing and easy to lose:
//
//   1. ONE REQUEST. Five steps, one atomic POST /org/setup. A wizard that writes per step
//      leaves half-built organisations behind every time somebody closes the tab, and an
//      org with roles and no structure looks finished from the outside.
//   2. NOTHING IS LOST BY NAVIGATING. All state lives in one object above the steps, so
//      Back is free and a rename made three steps earlier survives. A wizard that forgets
//      a rename is a wizard that dies on stage.
//   3. THE STEP IS IN THE URL. Back works, and a step is linkable during a rehearsal.
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

/** Minimally valid, per step. Continue is enabled the moment it is — never gated on
 *  optional polish (design_specs/design/03 §3.5). */
function canContinue(state: WizardState, step: number): boolean {
  if (step === 0) return state.industry !== null;
  if (step === 1) {
    const names = state.roles.map((role) => role.name.trim());
    return names.length >= 2 && names.every(Boolean) &&
      new Set(names.map((name) => name.toLowerCase())).size === names.length;
  }
  if (step === 2) return state.units.length >= 1 && state.units.every((u) => u.name.trim());
  if (step === 3) return true;
  return true;
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
    const target = STEPS[Math.max(0, Math.min(index, STEPS.length - 1))];
    if (target) setParams({ step: target.key }, { replace: false });
  };

  const current = useMemo(
    () => presets.data?.find((preset) => preset.key === state.industry),
    [presets.data, state.industry],
  );

  // Esc NEVER closes the wizard — far too destructive when everything is unsaved. Enter
  // advances, from anywhere that is not a button (which has its own meaning for Enter).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      // A modal owns the keyboard while it is up. Without this the wizard advanced a step
      // BEHIND the confirm dialog — the dialog stayed open over a screen that was no
      // longer the one it was asking about.
      if (pendingPreset) return;
      const target = event.target as HTMLElement | null;
      if (target && ['BUTTON', 'TEXTAREA'].includes(target.tagName)) return;
      if (step < STEPS.length - 1 && canContinue(state, step)) goto(step + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choose = (preset: PresetView): void => {
    // Changing industry after later steps were edited would silently throw that work away.
    // Ask — and only when there is something to lose.
    if (state.industry && state.industry !== preset.key && hasEdits(state, current)) {
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
      // The org's vocabulary just changed under every screen in the console. Re-read the
      // session before navigating, or /app renders the words the wizard replaced.
      await refreshSession();
      navigate('/app?setup=done', { replace: true });
    } catch (caught) {
      // Keep every field. 31 § States: "Never lose the typed input."
      setError(caught as Error);
      setSaving(false);
    }
  }

  /**
   * The emergency exit, and IT MUST WORK. If the wizard breaks on stage this drops into a
   * usable console with the Custom preset applied — which is a real commit, not a
   * navigation, because a console with no roles is exactly the empty screen the wizard
   * exists to prevent.
   */
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

  // The presets load BEFORE step 1 renders — 31 § States. A grid that pops in after a beat
  // is the first thing an evaluator sees, and it reads as a page that is not ready.
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
          preset={current}
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
