// Step 4 of the wizard: a thin wrapper around <WordsEditor> plus a live preview, so a
// reader sees the effect of a renamed word immediately rather than on the next screen.
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
      {/* Every prop here is forwarded as-is — this step owns no editing state of its own,
          only the wizard's, so a rename here and a rename from Settings later go through
          the identical component rather than two implementations of the same form. */}
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
