import { useState } from 'react';
import type { AnswerValue } from '@endur/shared';
import { QuestionInput, type Question } from './QuestionInput.js';

export const PREVIEW_WIDTHS = [
  { key: 'desktop', label: 'Desktop', width: 0 },
  { key: 'tablet', label: 'Tablet', width: 720 },
  { key: 'phone', label: 'Phone', width: 390 },
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
  respondentWord: string;
  emptyBody?: string;
}): JSX.Element {
  const [width, setWidth] = useState<PreviewWidth>('desktop');
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
