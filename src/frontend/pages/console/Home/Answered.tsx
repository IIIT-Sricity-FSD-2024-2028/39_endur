// "Your past feedback": the members-only forms this person has answered, under the ones still
// waiting.
//
// THAT they answered, never WHAT: a response carries no name, so there is nothing to show them,
// their own answer included. The card says so, because "where are my answers?" is the first
// thing anybody reading this list would ask.
import { useState } from 'react';
import type { AnsweredForm } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { formatDate } from '../../../lib/format.js';

/** Enough to recognise the last few; the rest is one press away. */
export const SHOWN = 5;

export function Answered({
  rows,
  orgName,
  caughtUp,
}: {
  rows: AnsweredForm[];
  orgName: string;
  /** Nothing is waiting either: on a page with no other content, the card says so first. */
  caughtUp: boolean;
}): JSX.Element | null {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <section className="card answered" aria-labelledby="answered-title">
      <header className="waiting-head">
        <h2 className="panel-title" id="answered-title">
          Your past feedback
          <span className="tab-count">{rows.length}</span>
        </h2>
        <p className="text-muted waiting-hint">
          {caughtUp && 'Nothing is waiting for your answer right now. '}
          {orgName} can see that you answered these, never what you said, so your answers are
          not shown here either.
        </p>
      </header>

      <ul className="answered-list">
        {shown.map((form) => (
          <li key={form.campaignId} className="answered-item">
            <Icon name="check" size={16} className="answered-check" />
            <div className="waiting-what">
              <span className="waiting-name">{form.name}</span>
              <span className="text-meta">{details(form)}</span>
            </div>
            <span className={`tag ${form.status === 'open' ? 'tag-good' : 'tag-muted'}`}>
              {form.status === 'open' ? 'Open' : 'Closed'}
            </span>
          </li>
        ))}
      </ul>

      {rows.length > SHOWN && (
        <button
          type="button"
          className="btn btn-ghost answered-more"
          aria-expanded={all}
          onClick={() => setAll((current) => !current)}
        >
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

/** "Algebra · closed 12 Nov 2026", "open until 20 Nov 2026", "still open". */
function details(form: AnsweredForm): string {
  const when =
    form.status === 'closed'
      ? form.closedAt
        ? `closed ${formatDate(form.closedAt)}`
        : 'closed'
      : form.endsAt
        ? `open until ${formatDate(form.endsAt)}`
        : 'still open';
  return [...(form.about ? [form.about] : []), when].join(' · ');
}
