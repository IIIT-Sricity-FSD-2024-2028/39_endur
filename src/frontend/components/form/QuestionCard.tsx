// <QuestionCard> — 24 §5, design_specs/design/05 §5.2.
//
// One question, expanded or collapsed. EXACTLY ONE IS EXPANDED AT A TIME and that is
// controlled by the parent, not here: a card that owned its own expansion could not know
// about its siblings, and "all ten open at once" is what makes a ten-question form
// unscannable (37).
//
// Collapsed it is a 52px row — handle, text, type tag. Expanded it grows the accent left
// edge, the type select and the editor. Clicking anywhere on a collapsed card opens it.
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
  /** Its place in the stack, for the accessible name of a card whose text is still empty. */
  index: number;
  expanded: boolean;
  onExpand: () => void;
  onChange: (question: QuestionDraft) => void;
  onDuplicate: () => void;
  /** Immediate, with an undo toast at the parent. A dialog per question would make
   *  authoring miserable, and undo is the better answer for a cheap reversible action (37). */
  onDelete: () => void;
  /**
   * Reorder by one place. Added at T-037, and it is the same rule <UnitTree> and <RoleRow>
   * already follow: HTML5 drag does not exist on touch at all, and 37 § Acceptance requires
   * the builder to be usable at 390px. The grip stays draggable; this does the same job by
   * click and by keyboard. Absent at the ends of the list.
   */
  onMove?: ((direction: -1 | 1) => void) | undefined;
  readOnly?: boolean;
}): JSX.Element {
  /** A pending type change, held until the reader has read what it costs. */
  const [pending, setPending] = useState<{ kind: QuestionKind; warning: string } | null>(null);

  const label = question.text.trim() || `Question ${index + 1}`;

  const retype = (kind: QuestionKind): void => {
    const change = changeKind(question, kind);
    // Warned ONCE, before the change — after it the options are gone and an apology is not
    // a warning (37 § Interactions).
    if (change.warning) setPending({ kind, warning: change.warning });
    else onChange(change.question);
  };

  if (!expanded) {
    return (
      // NOT `role="button"` on the row itself. The row carries the reorder controls, and a
      // button containing buttons is invalid ARIA — assistive tech gets one control whose
      // name is every label inside it concatenated. Found by a test that could not tell the
      // row from its own Move button.
      //
      // So: the row keeps its click handler for the mouse (the whole 52px is the target,
      // which is the ergonomic the mockup is drawing), and the NAME is a real button inside
      // it. That is the one control the keyboard and the accessibility tree see.
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

/** Two buttons doing what the grip does, for every input device that has no drag. */
function Move({
  label, onMove, readOnly,
}: { label: string; onMove: ((direction: -1 | 1) => void) | undefined; readOnly: boolean }): JSX.Element | null {
  if (!onMove || readOnly) return null;
  return (
    <span className="qcard-move">
      <button
        type="button"
        className="btn btn-icon"
        // Stops the collapsed row's own click handler from expanding the card underneath
        // a reorder — moving a question is not a request to open it.
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
