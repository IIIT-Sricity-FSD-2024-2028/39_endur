// T-035 — /app/templates/:id. 36 § Interactions, design_specs/design/05 §5.1 and §5.4.
//
// **The preview renders through `<FormPreview>`, which renders through `<QuestionInput>`**
// (INV-008). That is the entire point of this screen: "preview a template exactly as
// respondents will see it" is either true or it is marketing, and it is only true while
// there is one implementation.
//
// T-035 wrote that preview inline here. T-037 lifted it into a component because the builder
// previews the same thing at `/app/forms/:id/preview`, and two previews of one form is the
// drift INV-008 exists to prevent, one level up.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { FormPreview } from '../../../components/form/FormPreview.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { cloneKey, useTemplate, useTemplateLibrary, useTemplates } from '../../../lib/templates.js';
import { deleteConsequence } from './consequence.js';

export default function TemplateDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const navigate = useNavigate();

  const template = useTemplate(id);
  const library = useTemplateLibrary();
  const list = useTemplates();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const detail = template.data;

  /**
   * "Related templates are suggested on the preview" (36). Same category first, then the
   * same industry — no extra request, because the library is already loaded and twenty
   * cards is not a search problem.
   */
  const related = useMemo(() => {
    if (!detail) return [];
    const rows = (library.data ?? []).filter((row) => row.id !== detail.id);
    const score = (row: (typeof rows)[number]): number =>
      (row.category === detail.category ? 2 : 0) + (row.industry === detail.industry ? 1 : 0);
    return rows.filter((row) => score(row) > 0).sort((a, b) => score(b) - score(a)).slice(0, 3);
  }, [library.data, detail]);

  const message = (cause: unknown, fallback: string): string =>
    cause instanceof ApiError ? cause.message : fallback;

  if (template.loading && !detail) {
    return <p className="text-muted">Loading…</p>;
  }

  if (!detail) {
    return (
      <div className="fullpage">
        <div>
          <h3>That template is not here</h3>
          <p className="text-muted">{message(template.error, 'It may have been deleted.')}</p>
          <Link className="btn btn-secondary" to="/app/templates">Back to templates</Link>
        </div>
      </div>
    );
  }

  const time = approxDuration(detail.estimatedSeconds);
  const verdict = deleteConsequence(detail, labels.campaign);

  const use = (): void => {
    setBusy(true);
    setError(null);
    void list
      .clone(detail.id, cloneKey(detail.id))
      .then((created) => navigate(`/app/forms/${created.id}/build`))
      .catch((cause: unknown) => setError(message(cause, 'That could not be copied.')))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        title={detail.name}
        subtitle={`${pluralise(detail.questionCount, 'question', 'questions')}${time ? ` · ${time}` : ''} · ${detail.category}`}
        action={
          <span className="page-actions">
            <Link className="btn btn-ghost" to="/app/templates">Back</Link>
            {!detail.isLibrary && can('template.delete') && (
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
            {can('template.clone') && (
              <button type="button" className="btn btn-primary" onClick={use} disabled={busy}>
                {busy ? 'Copying…' : 'Use this'}
              </button>
            )}
          </span>
        }
      />

      {error && <p className="form-error" role="alert">{error}</p>}

      <FormPreview
        title={detail.name}
        description={detail.description}
        questions={detail.questions}
        respondentWord={labels.respondent.one.toLowerCase()}
        emptyBody="This form has no questions yet. Open it in the builder to add some."
      />

      {related.length > 0 && (
        <section className="tsection">
          <h3 className="tsection-head">Related</h3>
          <ul className="related-list">
            {related.map((row) => (
              <li key={row.id}>
                <Link to={`/app/templates/${row.id}`}>{row.name}</Link>
                <span className="text-meta">
                  {' '}
                  {pluralise(row.questionCount, 'question', 'questions')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Delete ${detail.name}?`}
          consequence={verdict.consequence}
          verb="Delete"
          destructive
          confirmDisabled={verdict.blocked}
          onConfirm={() => {
            setConfirming(false);
            void list
              .remove(detail.id)
              .then(() => navigate('/app/templates'))
              .catch((cause: unknown) => setError(message(cause, 'That could not be deleted.')));
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
