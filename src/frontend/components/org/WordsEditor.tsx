// The five vocabulary fields and the live preview. 24 §4, 41 § Interactions, 31 § step 4.
//
// ONE implementation, two placements: wizard step 4 and the settings page. 41 asks for "the
// same five fields and the same live preview as wizard step 4", which is only true if it is
// literally the same component — the same rule that keeps <UnitTree> from being forked.
//
// It never calls useLabels() itself. The wizard edits a draft that has not been saved and
// settings edits the org that has; a component that reached for the store would render the
// wrong one of those two.
import { LabelKey, type ResolvedLabels } from '@endur/shared';
import { Icon } from '../Icon.js';
import { derivePlural } from '../../lib/format.js';

/** The question each label answers, in the customer's terms rather than the schema's. */
const PROMPTS: Record<LabelKey, string> = {
  unit: 'A part of the organization',
  subject: 'The thing being reviewed',
  respondent: 'The people giving feedback',
  reviewee: 'The people being reviewed',
  campaign: 'A round of collection',
};

export function WordsEditor({
  labels,
  overrides,
  onSetOne,
  onSetMany,
  onResetPlural,
  readOnly = false,
}: {
  labels: ResolvedLabels;
  overrides: LabelKey[];
  onSetOne: (key: LabelKey, one: string) => void;
  onSetMany: (key: LabelKey, many: string) => void;
  onResetPlural: (key: LabelKey) => void;
  /** Someone with `org.read` but not `org.update` still sees their words — they just
   *  cannot change them. Read-only, not absent: the vocabulary is what the rest of the
   *  console is speaking, so hiding it would hide an explanation (INV-003, 41 § States). */
  readOnly?: boolean;
}): JSX.Element {
  return (
    <div className="card words-card">
      <div className="word-row word-row-header" aria-hidden="true">
        <span className="word-prompt"></span>
        <span className="word-header text-meta">Singular</span>
        <span className="word-header text-meta">Plural</span>
      </div>
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
              disabled={readOnly}
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
                disabled={readOnly}
                onChange={(event) => onSetMany(key, event.target.value)}
              />
              {/* `your plural` — restored at DEC-085 after the redesign dropped it.
                  22 §2 stores singular and plural separately for exactly one reason: some
                  organisations' plurals are not the derived ones. `Staff / Staff` and
                  `Faculty / Faculty` are the cases that matter, and in both the field looks
                  identical to a field nobody touched. Without this line the override state
                  is invisible until you notice an icon has appeared — and an override that
                  reads as an accident is one somebody types over.

                  The `auto: Wings` half is NOT restored: beside a filled field showing
                  `Wings`, a hint saying `auto: Wings` repeats the field. It is the OVERRIDE
                  that needs saying, because that is the state the field cannot show. */}
              <span className="text-meta word-hint">
                {overridden && derived !== labels[key].many && (
                  <>
                    <span className="word-hint-own">your plural</span>
                    {/* Shown to a read-only reader too. The hint explains why the plural is
                        not the obvious one; only the undo is a permission (41 § States). */}
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => onResetPlural(key)}
                        title={`Reset to ${derived}`}
                      >
                        <Icon name="edit" size={16} label={`Reset to the derived plural ${derived}`} />
                      </button>
                    )}
                  </>
                )}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
