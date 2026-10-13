import type { TemplateSummary } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { TemplatePreview } from './TemplatePreview.js';

export function TemplateCard({
  template,
  campaign,
  busy = false,
  onPreview,
  onUse,
  onOpen,
  onDelete,
  error,
}: {
  template: TemplateSummary;
  campaign: { one: string; many: string };
  busy?: boolean;
  onPreview: () => void;
  onUse?: (() => void) | undefined;
  onOpen?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  error?: string | undefined;
}): JSX.Element {
  const time = approxDuration(template.estimatedSeconds);

  return (
    <article className={`card tcard${template.isLibrary ? ' is-library' : ''}`}>
      {/* The shape of the form, before its name. Twelve cards of identical text are
          impossible to compare; twelve drawings of different lengths are not. */}
      <button
        type="button"
        className="tcard-figure"
        onClick={onPreview}
        aria-label={`Preview ${template.name}`}
      >
        <TemplatePreview questionCount={template.questionCount} />
      </button>

      <h4 className="tcard-name">
        <Icon name="template" size={16} className="tcard-icon" />
        {template.name}
      </h4>
      <p className="tcard-category tag tag-outline">{template.category}</p>

      {template.description && <p className="tcard-desc text-muted">{template.description}</p>}

      <p className="tcard-cost">
        {pluralise(template.questionCount, 'question', 'questions')}
        {time && <> · {time}</>}
      </p>

      {/* Only on the org's own. A library template's usage count would be every customer's
          combined, which is a number this org cannot act on and should not see. */}
      {!template.isLibrary && (
        <p className="tcard-usage text-meta">
          {template.campaignCount > 0
            ? `Used in ${pluralise(template.campaignCount, campaign.one.toLowerCase(), campaign.many.toLowerCase())}`
            : 'Never used'}
        </p>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="tcard-actions">
        <button type="button" className="btn btn-ghost" onClick={onPreview}>
          Preview
        </button>
        {onOpen && (
          <button type="button" className="btn btn-secondary" onClick={onOpen}>
            Open
          </button>
        )}
        {onUse && (
          <button type="button" className="btn btn-primary" onClick={onUse} disabled={busy}>
            {busy ? 'Copying…' : 'Use'}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="btn btn-icon"
            onClick={onDelete}
          >
            <Icon name="delete" size={16} label={`Delete ${template.name}`} />
          </button>
        )}
      </div>
    </article>
  );
}
