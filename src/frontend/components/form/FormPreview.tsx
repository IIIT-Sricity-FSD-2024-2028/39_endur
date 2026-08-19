// <FormPreview> — 24 §5, design_specs/design/05 §5.4, 36 § Interactions.
//
// TWO SCREENS PREVIEW A FORM: the template library and the builder. They must show the
// identical thing, which is the same argument INV-008 makes about the inputs themselves one
// level down — a preview that is "approximate" on one of the two screens is a preview that
// lies, and the lie surfaces on the demo phone.
//
// T-035 wrote this inline on the template page. T-037 lifted it here and rewired that page
// rather than writing a second one.
import { useState } from 'react';
import type { AnswerValue } from '@endur/shared';
import { QuestionInput, type Question } from './QuestionInput.js';

/**
 * Real pixel frames rather than a browser resize. The question being answered is "what does
 * somebody on a phone see", and that has to be answerable while sitting at a desktop.
 */
export const PREVIEW_WIDTHS = [
  { key: 'phone', label: 'Phone', width: 390 },
  { key: 'tablet', label: 'Tablet', width: 720 },
  { key: 'desktop', label: 'Desktop', width: 0 },
] as const;

export type PreviewWidth = (typeof PREVIEW_WIDTHS)[number]['key'];

export function FormPreview({
  title,
  description,
  questions,
  respondentWord,
  emptyBody,
}: {
  title: string;
  description?: string | null;
  questions: Question[];
  /** The org's own noun — "guest", "patient", "student" (INV-001). Never written here. */
  respondentWord: string;
  /** What to say when there is nothing to answer yet. The two callers differ. */
  emptyBody?: string;
}): JSX.Element {
  const [width, setWidth] = useState<PreviewWidth>('phone');
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const frame = PREVIEW_WIDTHS.find((entry) => entry.key === width);

  return (
    <>
      <div className="preview-bar">
        <div className="segmented" role="radiogroup" aria-label="Preview width">
          {PREVIEW_WIDTHS.map((entry) => (
            <label className={`segment${width === entry.key ? ' is-active' : ''}`} key={entry.key}>
              <input
                type="radio"
                name="preview-width"
                checked={width === entry.key}
                onChange={() => setWidth(entry.key)}
              />
              <span>{entry.label}</span>
            </label>
          ))}
        </div>
        <p className="preview-note">
          Preview — nothing is saved. This is exactly what a {respondentWord} sees.
        </p>
      </div>

      <div className="preview-stage">
        <div
          className={`preview-frame is-${width}`}
          {...(frame && frame.width > 0 ? { style: { maxWidth: `${frame.width}px` } } : {})}
        >
          <h3 className="preview-title">{title}</h3>
          {description && <p className="text-muted">{description}</p>}

          {questions.length === 0 ? (
            <p className="text-muted">{emptyBody ?? 'This form has no questions yet.'}</p>
          ) : (
            questions.map((question) => (
              // The controls RESPOND. A preview where clicking a rating does nothing reads
              // as broken rather than as read-only, and the banner above already says the
              // answers go nowhere.
              <QuestionInput
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
              />
            ))
          )}

          {/* Disabled, and labelled with what it would do. Removing it would make the
              preview shorter than the real form and hide the one control every respondent
              has to find. */}
          <button type="button" className="btn btn-primary preview-submit" disabled>
            Submit
          </button>
        </div>
      </div>
    </>
  );
}
