// One card in the library grid. 36 § Interactions, design_specs/design/05 §5.1.
//
// Page-local and deliberately NOT a catalogue component: it is a card grid, which `24` §10
// rules out as an abstraction ("four forms, all different"), and its two variants differ in
// what they can DO rather than in how they look.
//
// The count and the completion time are on every card, always — that is the commercial
// constraint the product rests on (`01` §5). Competitors ship 40-question templates;
// putting the cost in the reader's eye before the name is what makes "deliberately short"
// a promise rather than a claim in a pitch deck.
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
  /**
   * The org's own word for a campaign — "Feedback cycle / Feedback cycles", "Guest survey /
   * Guest surveys" (INV-001). BOTH forms, never derived: "Faculty" pluralises to "Faculty",
   * and stripping an `s` to make a singular is the same mistake pointing the other way.
   */
  campaign: { one: string; many: string };
  busy?: boolean;
  /** Opens the quick-look dialog. The full page is still reachable from inside it. */
  onPreview: () => void;
  /** Clone into the org. Absent without `template.clone`. */
  onUse?: (() => void) | undefined;
  /** The org's own templates only: straight into the builder. */
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
