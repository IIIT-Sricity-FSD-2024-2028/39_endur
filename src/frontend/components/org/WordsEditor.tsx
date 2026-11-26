import { LabelKey, type ResolvedLabels } from '@endur/shared';
import { Icon } from '../Icon.js';
import { derivePlural } from '../../lib/format.js';

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
              {/* Hidden beside the column header on a wide screen; shown on a phone, where
                  the two fields stack and the header row has nothing left to sit over. */}
              <label className="sr-only word-plural-label" htmlFor={`plural-${key}`}>
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

/**
 * The same five words, for somebody who may read them but not change them: a table, not a
 * form with every field switched off. A disabled input still looks like a place to type.
 */
export function WordsTable({ labels }: { labels: ResolvedLabels }): JSX.Element {
  return (
    <div className="card">
    <table className="words-table">
      <caption className="sr-only">The organization's words</caption>
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">What it names</span></th>
          <th scope="col" className="text-meta">Singular</th>
          <th scope="col" className="text-meta">Plural</th>
        </tr>
      </thead>
      <tbody>
        {LabelKey.options.map((key) => (
          <tr key={key}>
            <th scope="row" className="word-prompt">{PROMPTS[key]}</th>
            <td>{labels[key].one}</td>
            <td>{labels[key].many}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

