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
