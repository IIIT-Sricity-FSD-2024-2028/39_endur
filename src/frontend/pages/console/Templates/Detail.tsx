// One template. What is in flight or open on the page is `state.templates.pages[id]`
// (store/screens/templates.ts); Use this and Delete are thunks there.
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { FormPreview } from '../../../components/form/FormPreview.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { useTemplate, useTemplateLibrary } from '../../../lib/templates.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  FAILED,
  selectTemplatePage,
  templateCopied,
  templateDeleteAskedOnPage,
  templateDeleteDismissedOnPage,
  templateDeleted,
  templatePageLeft,
} from '../../../store/screens/templates.js';
import { deleteConsequence } from './consequence.js';

export default function TemplateDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const navigate = useNavigate();

  const template = useTemplate(id);
  const library = useTemplateLibrary();

  const templateId = id ?? '';
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectTemplatePage(state, templateId));
  useClearOnLeave(templatePageLeft({ templateId }));
  const busy = page.copying;
  const confirming = page.confirmingDelete;
  const error = messageOf(page.error, page.failedDuring ? FAILED[page.failedDuring] : '');

  const detail = template.data;

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
    void dispatch(templateCopied({ templateId: detail.id, from: 'page' })).then((result) => {
      if (templateCopied.fulfilled.match(result)) navigate(`/app/forms/${result.payload.id}/build`);
    });
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
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(templateDeleteAskedOnPage({ templateId: detail.id }))}>
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
          onConfirm={() =>
            void dispatch(templateDeleted({ templateId: detail.id, name: detail.name, from: 'page' })).then(
              (result) => {
                if (templateDeleted.fulfilled.match(result)) navigate('/app/templates');
              },
            )
          }
          onCancel={() => dispatch(templateDeleteDismissedOnPage({ templateId: detail.id }))}
        />
      )}
    </>
  );
}
