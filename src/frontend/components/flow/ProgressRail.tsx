// <ProgressRail> — 24 §6, design_specs/design/03 §3.4.
//
// Completed steps are clickable, pending ones are not. That is not a styling detail: on a
// five-step wizard the rail is the only affordance that says "you can go back", and making
// a pending step look reachable is how somebody skips step 2 and finds out at step 5.
import { Icon } from '../Icon.js';

export type RailStep = { key: string; label: string };

export function ProgressRail({
  steps,
  current,
  onStepClick,
}: {
  steps: RailStep[];
  current: number;
  onStepClick?: ((index: number) => void) | undefined;
}): JSX.Element {
  return (
    <ol className="rail" aria-label="Setup progress">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'pending';
        const reachable = state === 'done' && onStepClick !== undefined;

        return (
          <li className={`rail-step is-${state}`} key={step.key}>
            <span className="rail-track" aria-hidden="true" />
            {reachable ? (
              <button type="button" className="rail-dot" onClick={() => onStepClick(index)}>
                <Icon name="check" size={16} label={`Back to ${step.label}`} />
              </button>
            ) : (
              <span className="rail-dot" aria-hidden="true" />
            )}
            <span className="rail-label utility" aria-current={state === 'current' ? 'step' : undefined}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
