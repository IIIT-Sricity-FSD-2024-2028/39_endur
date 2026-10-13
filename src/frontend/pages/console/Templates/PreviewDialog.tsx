import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { TemplateSummary } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { useTemplate } from '../../../lib/templates.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { TemplatePreview } from './TemplatePreview.js';

const KIND_LABEL: Record<string, string> = {
  rating: 'Rating',
  nps: 'Score out of 10',
  single: 'One choice',
  multi: 'Several choices',
  yesno: 'Yes or no',
  text: 'Written answer',
};

export function PreviewDialog({
  template,
  busy = false,
  onUse,
  onOpen,
  onClose,
}: {
  template: TemplateSummary;
  busy?: boolean;
  onUse?: (() => void) | undefined;
  onOpen?: (() => void) | undefined;
  onClose: () => void;
}): JSX.Element {
  const detail = useTemplate(template.id);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [onClose]);

  const questions = detail.data?.questions ?? [];
  const time = approxDuration(template.estimatedSeconds);

  return (
    <div className="dialog-backdrop tpv-backdrop" onMouseDown={onClose}>
      <div
        className="tpv glass glass-strong glass-lit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpv-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tpv-head">
          <div className="tpv-headings">
            <p className="tag tag-outline tpv-category">{template.category}</p>
            <h2 className="tpv-title" id="tpv-title">{template.name}</h2>
            <p className="tpv-cost">
              {pluralise(template.questionCount, 'question', 'questions')}
              {time && <> · {time}</>}
            </p>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="btn btn-icon tpv-close"
            onClick={onClose}
          >
            <Icon name="close" size={20} label="Close preview" />
          </button>
        </header>

        <div className="tpv-body">
          {/* The drawing, at full size. It is the same component the card uses — one
              picture of a form in the product, not two that drift. */}
          <figure className="tpv-figure">
            <TemplatePreview
              questionCount={template.questionCount}
              kinds={questions.length > 0 ? questions.map((question) => question.kind) : undefined}
              className="tp-large"
            />
          </figure>

          <div className="tpv-detail">
            {template.description && <p className="tpv-desc">{template.description}</p>}

            {detail.error && (
              <p className="form-error" role="alert">
                The questions could not be loaded.{' '}
                <button type="button" className="btn btn-ghost" onClick={() => void detail.reload()}>
                  Try again
                </button>
              </p>
            )}

            {detail.loading && !detail.data && (
              <ol className="tpv-questions" aria-hidden="true">
                {[0, 1, 2, 3].map((row) => (
                  <li className="tpv-question is-skeleton" key={row}>
                    <span className="skeleton-row" />
                  </li>
                ))}
              </ol>
            )}

            {questions.length > 0 && (
              <ol className="tpv-questions">
                {questions.map((question, index) => (
                  <li className="tpv-question" key={question.id}>
                    <span className="tpv-question-num num" aria-hidden="true">{index + 1}</span>
                    <span className="tpv-question-text">{question.text}</span>
                    <span className="tag tag-neutral tpv-kind">
                      {KIND_LABEL[question.kind] ?? question.kind}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <footer className="tpv-foot">
          <Link className="btn btn-ghost" to={`/app/templates/${template.id}`}>
            Open the full page
          </Link>
          <span className="tpv-foot-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            {onOpen && (
              <button type="button" className="btn btn-primary" onClick={onOpen}>
                Open in the builder
              </button>
            )}
            {onUse && (
              <button type="button" className="btn btn-primary" onClick={onUse} disabled={busy}>
                {busy ? 'Copying…' : 'Use this template'}
              </button>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}
