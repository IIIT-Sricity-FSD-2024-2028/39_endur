import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { QuestionCard } from '../../../components/form/QuestionCard.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { cloneKey, useCloneTemplate } from '../../../lib/templates.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import {
  questionAdded,
  questionDuplicated,
  questionEdited,
  questionMoved,
  questionRemoved,
  questionRestored,
  metaEdited,
  redoRequested,
  selectCanRedo,
  selectCanUndo,
  selectDraft,
  selectEstimatedSeconds,
  selectLocked,
  undoRequested,
} from '../../../store/builderSlice.js';
import { toastShown } from '../../../store/uiSlice.js';
import { useBuilder } from './useBuilder.js';
import { SaveIndicator } from './SaveIndicator.js';

export default function Builder(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const labels = useLabels();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const builder = useBuilder(id);
  // Clone only. The builder has no use for the template LIST, so it does not load it.
  const cloneTemplate = useCloneTemplate();

  // The draft and everything derived from it come from the builder slice. Each selector is
  // its own subscription, so typing in a question re-renders what reads the draft and
  // nothing that reads only, say, whether there is anything to redo.
  const draft = useAppSelector(selectDraft);
  const locked = useAppSelector(selectLocked);
  const estimatedSeconds = useAppSelector(selectEstimatedSeconds);
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);

  const [openAt, setOpenAt] = useState<number | null>(0);
  const [cloning, setCloning] = useState(false);

  const editable = can('template.update') && !locked;

  // Every edit is an event with its payload; the slice does the array work, records the
  // undo step and marks the draft dirty, and the autosave listener takes it from there.
  const addQuestion = (): void => {
    // A new question starts as a rating: it is the most common kind in every seeded
    // template, and starting somewhere is faster than starting at a chooser.
    dispatch(questionAdded({ kind: 'rating' }));
  };

  const duplicate = (at: number): void => {
    dispatch(questionDuplicated({ index: at }));
    setOpenAt(at + 1);
  };

  const remove = (at: number): void => {
    const question = draft.questions[at];
    if (!question || !id) return;
    dispatch(questionRemoved({ index: at }));
    // Deleted at once, no dialog, with an Undo. The Undo is an ACTION, not a callback: the
    // toast lives in the store (R-307), and pressing it dispatches `questionRestored`.
    dispatch(
      toastShown({
        message: `${question.text.trim() || `Question ${at + 1}`} deleted.`,
        undo: questionRestored({ templateId: id, at, question }),
      }),
    );
    setOpenAt(null);
  };

  const move = (at: number, direction: -1 | 1): void => {
    const to = at + direction;
    if (to < 0 || to >= draft.questions.length) return;
    dispatch(questionMoved({ from: at, to }));
    if (openAt === at) setOpenAt(to);
  };

  const duplicateTemplate = (): void => {
    if (!id) return;
    setCloning(true);
    void cloneTemplate(id, cloneKey(id), `${draft.name} (copy)`)
      .then((created) => navigate(`/app/forms/${created.id}/build`))
      .finally(() => setCloning(false));
  };

  if (builder.loading) {
    return (
      <div className="builder" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div className="qcard is-collapsed" key={index}><span className="skeleton-row wide" /></div>
        ))}
      </div>
    );
  }

  if (builder.loadError || !builder.template) {
    return (
      <div className="fullpage">
        <div>
          <h3>That form is not here</h3>
          <p className="text-muted">
            {builder.loadError instanceof ApiError
              ? builder.loadError.message
              : 'It may have been deleted.'}
          </p>
          <Link className="btn btn-secondary" to="/app/templates">Back to templates</Link>
        </div>
      </div>
    );
  }

  const time = approxDuration(estimatedSeconds);

  return (
    <>
      <PageHeader
        title={draft.name || 'Untitled form'}
        vocabulary={false}
        action={
          <span className="page-actions">
            <SaveIndicator />
            {editable && (
              <>
                {/* Enabled and disabled straight from the slice: `past` and `future`. */}
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Undo last change"
                  disabled={!canUndo}
                  onClick={() => dispatch(undoRequested())}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label="Redo last change"
                  disabled={!canRedo}
                  onClick={() => dispatch(redoRequested())}
                >
                  Redo
                </button>
              </>
            )}
            <Link className="btn btn-secondary" to={`/app/forms/${id ?? ''}/preview`}>Preview</Link>
          </span>
        }
        filters={[
          {
            label: `${pluralise(draft.questions.length, 'question', 'questions')}${time ? ` · ${time}` : ''}`,
          },
        ]}
      />

      {locked && (
        <div className="builder-lock" role="status">
          <p>
            This form is in use by a {labels.campaign.one.toLowerCase()} that has already
            launched, so it cannot be edited — half the answers would be to a different form.
            Duplicate it to make changes.
          </p>
          {can('template.clone') && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={duplicateTemplate}
              disabled={cloning}
            >
              {cloning ? 'Duplicating…' : 'Duplicate to edit'}
            </button>
          )}
        </div>
      )}

      <div className="builder">
        <div className="builder-column">
          {/* The header card: title and description as borderless inputs that only reveal
              their field styling on focus (05 §5.2). */}
          <div className="card builder-header">
            <input
              className="input builder-title"
              value={draft.name}
              maxLength={120}
              placeholder="Untitled form"
              aria-label="Form name"
              disabled={!editable}
              onChange={(event) => dispatch(metaEdited({ name: event.target.value }))}
            />
            <input
              className="input builder-desc"
              value={draft.description}
              maxLength={400}
              placeholder="Add a line saying what this is for and how long it takes."
              aria-label="Form description"
              disabled={!editable}
              onChange={(event) => dispatch(metaEdited({ description: event.target.value }))}
            />
          </div>

          {draft.questions.map((question, index) => (
            <QuestionCard
              key={question.id ?? `new-${index}`}
              question={question}
              index={index}
              expanded={openAt === index}
              readOnly={!editable}
              onExpand={() => setOpenAt(index)}
              onChange={(next) => dispatch(questionEdited({ index, question: next }))}
              onDuplicate={() => duplicate(index)}
              onDelete={() => remove(index)}
              {...(editable && draft.questions.length > 1
                ? { onMove: (direction: -1 | 1) => move(index, direction) }
                : {})}
            />
          ))}

          {draft.questions.length === 0 && (
            <button type="button" className="builder-first" onClick={addQuestion} disabled={!editable}>
              <Icon name="add" size={20} /> Add your first question
            </button>
          )}
        </div>

        {/* The tool rail. ONE tool: add. The mockup's other four are an image block
            (nothing in QuestionConfig can hold one), a title block and a section (neither
            exists in the model), and import-from-another-form, which has no contract in 37.
            A rail of one is honest; four buttons that do nothing are not. */}
        {editable && (
          <div className="builder-rail">
            <button type="button" className="rail-tool" onClick={addQuestion}>
              <Icon name="add" size={20} label="Add question" />
            </button>
          </div>
        )}
      </div>

    </>
  );
}
