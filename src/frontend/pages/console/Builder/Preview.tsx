import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { FormPreview } from '../../../components/form/FormPreview.js';
import { useLabels } from '../../../lib/labels.js';
import { canAny, FORM_BUILDING, useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { useTemplate } from '../../../lib/templates.js';

export default function BuilderPreview(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const template = useTemplate(id);
  // Back to where this reader can go: the templates page is only for whoever builds forms.
  const back = canAny(can, FORM_BUILDING)
    ? { to: '/app/templates', label: 'Back to templates' }
    : { to: '/app', label: 'Back to your home page' };
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
          <Link className="btn btn-secondary" to={back.to}>{back.label}</Link>
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
          can('template.update') ? (
            <Link className="btn btn-secondary" to={`/app/forms/${id ?? ''}/build`}>
              Back to editing
            </Link>
          ) : (
            <Link className="btn btn-secondary" to={back.to}>{back.label}</Link>
          )
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
