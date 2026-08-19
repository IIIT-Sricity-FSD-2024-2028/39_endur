// Step 4 — words, and the live preview that is the point of the step.
// 31 § Interactions, design_specs/design/03 §3.4.
//
// THE PREVIEW IS THE PRODUCT CLAIM, PROVEN. Type "Studio" over "Course" and the nav
// changes as you type. That takes ten seconds in front of an evaluator and it is the
// difference between saying the product is customizable and showing it.
//
// It is a scaled, `pointer-events: none` render of the real sidebar shape — not a
// screenshot, not a mock. A preview that is separately maintained eventually lies.
import { LabelKey, type ResolvedLabels } from '@endur/shared';
import { Icon } from '../../../../components/Icon.js';
import { derivePlural } from '../../../../lib/format.js';

/** The question each label answers, in the customer's terms rather than the schema's. */
const PROMPTS: Record<LabelKey, string> = {
  unit: 'A part of the organization',
  subject: 'The thing being reviewed',
  respondent: 'The people giving feedback',
  reviewee: 'The people being reviewed',
  campaign: 'A round of collection',
};

export function WordsStep({
  labels,
  overrides,
  onSetOne,
  onSetMany,
  onResetPlural,
}: {
  labels: ResolvedLabels;
  overrides: LabelKey[];
  onSetOne: (key: LabelKey, one: string) => void;
  onSetMany: (key: LabelKey, many: string) => void;
  onResetPlural: (key: LabelKey) => void;
}): JSX.Element {
  return (
    <div className="step">
      <h2 className="step-title">What do you call things?</h2>
      <p className="step-lede">These words appear throughout Endur. Change them any time.</p>

      <div className="card words-card">
        {LabelKey.options.map((key) => {
          const overridden = overrides.includes(key);
          const derived = derivePlural(labels[key].one);

          return (
            <div className="word-row" key={key}>
              <label className="word-prompt" htmlFor={`word-${key}`}>{PROMPTS[key]}</label>
              <input
                id={`word-${key}`}
                className="input word-input"
                value={labels[key].one}
                maxLength={40}
                onChange={(event) => onSetOne(key, event.target.value)}
              />
              <span className="word-plural">
                <label className="sr-only" htmlFor={`plural-${key}`}>
                  Plural of {labels[key].one}
                </label>
                <input
                  id={`plural-${key}`}
                  className={`input word-input word-input-plural${overridden ? ' is-overridden' : ''}`}
                  value={labels[key].many}
                  maxLength={40}
                  onChange={(event) => onSetMany(key, event.target.value)}
                />
                {/* Auto-derived until touched, and then never again — the hotel org needs
                    "Staff / Staff", and a rule clever enough to guess that would be wrong
                    somewhere else instead. */}
                <span className="text-meta word-hint">
                  {overridden ? 'your plural' : `auto: ${derived}`}
                  {overridden && derived !== labels[key].many && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onResetPlural(key)}
                      title={`Use ${derived}`}
                    >
                      <Icon name="edit" size={16} label={`Use the derived plural ${derived}`} />
                    </button>
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="preview" aria-hidden="true">
        <p className="utility preview-kicker">Live preview</p>
        <div className="preview-inner">
          <div className="preview-nav">
            <span><Icon name="home" size={16} /> Home</span>
            <span><Icon name="structure" size={16} /> {labels.unit.many}</span>
            <span><Icon name="subject" size={16} /> {labels.subject.many}</span>
            <span><Icon name="campaign" size={16} /> {labels.campaign.many}</span>
          </div>
          <p className="preview-sentence">
            Spring 2026 · 4 {labels.subject.many} · 1,057 {labels.respondent.many} responded
          </p>
        </div>
      </div>
    </div>
  );
}
