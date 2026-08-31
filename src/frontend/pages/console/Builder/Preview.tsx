// T-037 — /app/forms/:id/preview. 37 § Interactions, design_specs/design/05 §5.4.
//
// The same `<FormPreview>` the template library uses, which renders through the same
// `<QuestionInput>` set the respondent form will use (INV-008). Three components deep, one
// implementation at every level — that chain is what makes "exactly as respondents see it"
// a fact rather than a claim.
//
// It reads the SAVED template rather than the builder's draft, and that is the honest thing
// to show: a preview of unsaved work would answer a question nobody asked. Autosave is
// 800ms, so in practice the two are the same thing a moment later.
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { FormPreview } from '../../../components/form/FormPreview.js';
import { useLabels } from '../../../lib/labels.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { useTemplate } from '../../../lib/templates.js';

export default function BuilderPreview(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const template = useTemplate(id);
  const detail = template.data;

  if (template.loading && !detail) return <p className="text-muted">Loading…</p>;

  if (!detail) {
    return (
      <div className="fullpage">
        <div>
          <h3>That form is not here</h3>
          <p className="text-muted">
            {template.error instanceof ApiError ? template.error.message : 'It may have been deleted.'}
          </p>
          <Link className="btn btn-secondary" to="/app/templates">Back to templates</Link>
        </div>
      </div>
    );
  }

  const time = approxDuration(detail.estimatedSeconds);

  return (
    <>
      <PageHeader
        title={detail.name}
        vocabulary={false}
        subtitle={`${pluralise(detail.questionCount, 'question', 'questions')}${time ? ` · ${time}` : ''}`}
        action={
          <Link className="btn btn-secondary" to={`/app/forms/${id ?? ''}/build`}>
            Back to editing
          </Link>
        }
      />
      <FormPreview
        title={detail.name}
        description={detail.description}
        questions={detail.questions}
        respondentWord={labels.respondent.one.toLowerCase()}
        emptyBody="Nothing to preview yet — add a question in the builder."
      />
    </>
  );
}
