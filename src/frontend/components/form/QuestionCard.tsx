import { useState } from 'react';
import type { QuestionKind } from '@endur/shared';
import { Icon } from '../Icon.js';
import { Toggle } from './Toggle.js';
import { QuestionEditor } from './QuestionEditor.js';
import { changeKind, KIND_GROUPS, KIND_LABELS, type QuestionDraft } from './kinds.js';

export function QuestionCard({
  question,
  index,
  expanded,
  onExpand,
  onChange,
  onDuplicate,
  onDelete,
  onMove,
  readOnly = false,
}: {
  question: QuestionDraft;
  index: number;
  expanded: boolean;
  onExpand: () => void;
  onChange: (question: QuestionDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove?: ((direction: -1 | 1) => void) | undefined;
  readOnly?: boolean;
}): JSX.Element {
  const [pending, setPending] = useState<{ kind: QuestionKind; warning: string } | null>(null);

  const label = question.text.trim() || `Question ${index + 1}`;

  const retype = (kind: QuestionKind): void => {
    const change = changeKind(question, kind);
    if (change.warning) setPending({ kind, warning: change.warning });
    else onChange(change.question);
  };

  if (!expanded) {
    return (
      <div className="qcard is-collapsed" onClick={onExpand}>
        <Icon name="drag" size={16} className="qcard-grip" />
        <button
          type="button"
          className="qcard-open"
          aria-expanded={false}
          onClick={(event) => { event.stopPropagation(); onExpand(); }}
        >
          {label}
        </button>
        <span className="tag tag-outline">{KIND_LABELS[question.kind]}</span>
        <Move label={label} onMove={onMove} readOnly={readOnly} />
      </div>
    );
  }

  return (
    <div className="qcard is-expanded">
      <div className="qcard-head">
        <Icon name="drag" size={16} className="qcard-grip" />
        <input
          className="input qcard-text"
          value={question.text}
          maxLength={300}
          placeholder="Ask something"
          aria-label={`Question ${index + 1}`}
          disabled={readOnly}
          onChange={(event) => onChange({ ...question, text: event.target.value })}
        />
        <label className="qcard-type">
          <span className="sr-only">Type of question {index + 1}</span>
          <select
            className="input"
            value={question.kind}
            disabled={readOnly}
            onChange={(event) => retype(event.target.value as QuestionKind)}
          >
            {/* Grouped: six ungrouped options read as a list of unrelated things (37). */}
            {KIND_GROUPS.map((group) => (
              <optgroup label={group.group} key={group.group}>
                {group.kinds.map((kind) => (
                  <option value={kind} key={kind}>{KIND_LABELS[kind]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <div className="qcard-body">
        <QuestionEditor question={question} onChange={onChange} readOnly={readOnly} />
      </div>

      {pending && (
        <div className="qcard-warning" role="alert">
          <p>{pending.warning}</p>
          <div className="qcard-warning-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
              Keep it as it is
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onChange(changeKind(question, pending.kind).question);
                setPending(null);
              }}
            >
              Change anyway
            </button>
          </div>
        </div>
      )}

      <hr className="hr" />

      <div className="qcard-foot">
        <button type="button" className="btn btn-icon" disabled={readOnly} onClick={onDuplicate}>
          <Icon name="duplicate" size={16} label={`Duplicate ${label}`} />
        </button>
        <button type="button" className="btn btn-icon" disabled={readOnly} onClick={onDelete}>
          <Icon name="delete" size={16} label={`Delete ${label}`} />
        </button>
        <Move label={label} onMove={onMove} readOnly={readOnly} />
        <span className="qcard-spacer" />
        <Toggle
          checked={question.required}
          disabled={readOnly}
          onChange={(required) => onChange({ ...question, required })}
          label="Required"
        />
      </div>
    </div>
  );
}

function Move({
  label, onMove, readOnly,
}: { label: string; onMove: ((direction: -1 | 1) => void) | undefined; readOnly: boolean }): JSX.Element | null {
  if (!onMove || readOnly) return null;
  return (
    <span className="qcard-move">
      <button
        type="button"
        className="btn btn-icon"
        onClick={(event) => { event.stopPropagation(); onMove(-1); }}
      >
        <Icon name="trend-up" size={16} label={`Move ${label} up`} />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        onClick={(event) => { event.stopPropagation(); onMove(1); }}
      >
        <Icon name="trend-down" size={16} label={`Move ${label} down`} />
      </button>
    </span>
  );
}
