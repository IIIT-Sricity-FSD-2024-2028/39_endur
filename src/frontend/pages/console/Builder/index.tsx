// T-037 — /app/forms/:id/build. 37, design_specs/design/05 §5.2.
//
// The largest single piece of UI in the build, and its layout is settled: header card, a
// stack of question cards with exactly ONE expanded, a tool rail pinned right.
//
// TWO THINGS THIS PAGE DOES NOT HAVE, both deliberate and both recorded as `CONF-014`:
// there is no **Publish** button and there are no **Responses / Settings** tabs. The design
// mockup draws all three; architecture has no publish endpoint, no published/draft rule that
// any campaign consults, and exactly two routes for this screen. Building them would mean
// inventing a contract, and the lock design attributes to Publish already exists for real —
// a template used by a LAUNCHED campaign is read-only, enforced server-side.
//
// There is no Save button either, and that part IS the design: the only commit is autosave.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { QuestionCard } from '../../../components/form/QuestionCard.js';
import { Toast } from '../../../components/feedback/Toast.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { cloneKey, useTemplates } from '../../../lib/templates.js';
import type { QuestionDraft } from '../../../components/form/kinds.js';
import { useBuilder } from './useBuilder.js';
import { SaveIndicator } from './SaveIndicator.js';

export default function Builder(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const labels = useLabels();
  const navigate = useNavigate();
  const builder = useBuilder(id);
  const templates = useTemplates();

  /** Exactly one card is open, and the stack is what knows which (37 § State). */
  const [openAt, setOpenAt] = useState<number | null>(0);
  /** The last delete, kept whole so undo is a restore rather than a re-creation. */
  const [undo, setUndo] = useState<{ question: QuestionDraft; at: number } | null>(null);
  const [cloning, setCloning] = useState(false);

  const { draft, locked } = builder;
  const editable = can('template.update') && !locked;

  const replace = (at: number, question: QuestionDraft): void =>
    builder.setQuestions(draft.questions.map((existing, index) => (index === at ? question : existing)));

  const duplicate = (at: number): void => {
    const source = draft.questions[at];
    if (!source) return;
    const questions = [...draft.questions];
    // The copy has NO id. It is a new row, and carrying the source's id would make the
    // bulk PUT rewrite the original instead of adding one.
    const { id: _drop, ...rest } = source;
    questions.splice(at + 1, 0, { ...rest, config: { ...source.config } });
    builder.setQuestions(questions);
    setOpenAt(at + 1);
  };

  const remove = (at: number): void => {
    const question = draft.questions[at];
    if (!question) return;
    builder.setQuestions(draft.questions.filter((_, index) => index !== at));
    // Immediate, with undo. A confirmation per question would make authoring miserable,
    // and undo is the better answer for a cheap reversible action (37).
    setUndo({ question, at });
    setOpenAt(null);
  };

  const move = (at: number, direction: -1 | 1): void => {
    const to = at + direction;
    if (to < 0 || to >= draft.questions.length) return;
    const questions = [...draft.questions];
    const [moved] = questions.splice(at, 1);
    if (moved) questions.splice(to, 0, moved);
    builder.setQuestions(questions);
    if (openAt === at) setOpenAt(to);
  };

  const restore = (): void => {
    if (!undo) return;
    const questions = [...draft.questions];
    questions.splice(Math.min(undo.at, questions.length), 0, undo.question);
    builder.setQuestions(questions);
    setUndo(null);
  };

  const duplicateTemplate = (): void => {
    if (!id) return;
    setCloning(true);
    void templates
      .clone(id, cloneKey(id), `${draft.name} (copy)`)
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

  const time = approxDuration(builder.estimatedSeconds);

  return (
    <>
      <PageHeader
        title={draft.name || 'Untitled form'}
        vocabulary={false}
        action={
          <span className="page-actions">
            <SaveIndicator state={builder.save} error={builder.saveError} onRetry={builder.flush} />
            <Link className="btn btn-secondary" to={`/app/forms/${id ?? ''}/preview`}>Preview</Link>
          </span>
        }
        filters={[
          {
            // The live cost of the form, and the whole argument against a forty-question
            // one: watching this climb past two minutes is more persuasive than an error
            // message (37 § Interactions).
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
              onChange={(event) => builder.setMeta({ name: event.target.value })}
            />
            <input
              className="input builder-desc"
              value={draft.description}
              maxLength={400}
              placeholder="Add a line saying what this is for and how long it takes."
              aria-label="Form description"
              disabled={!editable}
              onChange={(event) => builder.setMeta({ description: event.target.value })}
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
              onChange={(next) => replace(index, next)}
              onDuplicate={() => duplicate(index)}
              onDelete={() => remove(index)}
              {...(editable && draft.questions.length > 1
                ? { onMove: (direction: -1 | 1) => move(index, direction) }
                : {})}
            />
          ))}

          {draft.questions.length === 0 && (
            // Inline inside the stack, not a full-page empty state: the builder chrome is
            // the point, and a form with no questions is a form mid-authoring (37 § States).
            <button type="button" className="builder-first" onClick={builder.addQuestion} disabled={!editable}>
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
            <button type="button" className="rail-tool" onClick={builder.addQuestion}>
              <Icon name="add" size={20} label="Add question" />
            </button>
          </div>
        )}
      </div>

      {undo && (
        <Toast
          message={`${undo.question.text.trim() || `Question ${undo.at + 1}`} deleted.`}
          undo={restore}
          onDismiss={() => setUndo(null)}
        />
      )}
    </>
  );
}
