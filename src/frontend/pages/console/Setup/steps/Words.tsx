// Step 4 — words, and the live preview that is the point of the step.
// 31 § Interactions, design_specs/design/03 §3.4.
//
// The fields and the preview moved to <WordsEditor> at T-046 so the settings page could use
// the same ones (41 § Interactions, 24 §4). What is left here is the step's framing.
import type { LabelKey, ResolvedLabels } from '@endur/shared';
import { WordsEditor } from '../../../../components/org/WordsEditor.js';
import { DashboardPreview } from '../../../../components/org/DashboardPreview.js';

export function WordsStep({
  labels,
  overrides,
  onSetOne,
  onSetMany,
  onResetPlural,
}: {
  labels: ResolvedLabels;
  overrides: LabelKey[];
  onSetOne: (key: LabelKey, one: string) => void;
  onSetMany: (key: LabelKey, many: string) => void;
  onResetPlural: (key: LabelKey) => void;
}): JSX.Element {
  return (
    <div className="step">
      <h2 className="step-title">What do you call things?</h2>
      <p className="step-lede">These words appear throughout Endur. Change them any time.</p>
      <WordsEditor
        labels={labels}
        overrides={overrides}
        onSetOne={onSetOne}
        onSetMany={onSetMany}
        onResetPlural={onResetPlural}
      />
      {/* Restored at DEC-085. The redesign moved the preview to Review, where it is also
          right — but LATER is not the same claim. This step's lede says these words appear
          throughout Endur, and the preview is the only thing that PROVES it; proving it two
          steps after the reader has stopped doubting proves nothing. Typing `Studio` and
          watching a nav say `Studios` is the ten seconds that sells the generic model.
          The SAME component Review uses, not a second one (INV-009, 24 §4). */}
      <DashboardPreview labels={labels} />
    </div>
  );
}
