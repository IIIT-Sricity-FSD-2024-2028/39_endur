// "Waiting for your answer": the members-only forms this person is asked to fill in,
// answered right here on Home.
//
// The form is <RespondForm>, the same one the `/r/…` link shows, and it submits through the
// same respondent route. So the answer is exactly as anonymous here as there: the server
// records THAT this person answered (which is how the card knows to go), never what.
import { useState } from 'react';
import type { WaitingForm } from '@endur/shared';
import { formatDate } from '../../../lib/format.js';
import { useAnswerWaiting, useWaitingForm } from '../../../lib/waiting.js';
import { toastShown, useAppDispatch } from '../../../store/index.js';
import { costLine } from '../../respond/copy.js';
import { RespondForm } from '../../respond/RespondForm.js';

export function Waiting({ rows, orgName }: { rows: WaitingForm[]; orgName: string }): JSX.Element | null {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return null;

  return (
    <section className="card waiting" id="waiting" aria-labelledby="waiting-title">
      <header className="waiting-head">
        <h2 className="panel-title" id="waiting-title">
          Waiting for your answer
          <span className="tab-count">{rows.length}</span>
        </h2>
        <p className="text-muted waiting-hint">
          {orgName} would like your feedback. Answer here; each one takes a minute or two.
        </p>
      </header>

      <ul className="waiting-list">
        {rows.map((form) => {
          const isOpen = open === form.campaignId;
          return (
            <li key={form.campaignId} className={`waiting-item${isOpen ? ' is-open' : ''}`}>
              <div className="waiting-row">
                <div className="waiting-what">
                  <span className="waiting-name">{form.name}</span>
                  <span className="text-meta">{details(form)}</span>
                </div>
                <button
                  type="button"
                  className={`btn ${isOpen ? 'btn-ghost' : 'btn-primary'}`}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Close “${form.name}”` : `Answer “${form.name}”`}
                  onClick={() => setOpen(isOpen ? null : form.campaignId)}
                >
                  {isOpen ? 'Not now' : 'Answer'}
                </button>
              </div>
              {isOpen && <Answering form={form} onSent={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Algebra · 6 questions · about 2 minutes · anonymous · closes 12 Nov 2026". */
function details(form: WaitingForm): string {
  const parts = [
    ...(form.about ? [form.about] : []),
    costLine({ questionCount: form.questionCount, estimatedSeconds: form.estimatedSeconds, anonymous: false }),
    ...(form.endsAt ? [`closes ${formatDate(form.endsAt)}`] : []),
  ];
  return parts.join(' · ');
}

function Answering({ form, onSent }: { form: WaitingForm; onSent: () => void }): JSX.Element {
  const loaded = useWaitingForm(form.token);
  const answer = useAnswerWaiting();
  const dispatch = useAppDispatch();

  if (loaded.loading && !loaded.data) {
    return <p className="text-muted waiting-status" aria-busy="true">Loading the form…</p>;
  }
  if (!loaded.data) {
    return (
      <p className="field-error waiting-status" role="alert">
        {loaded.error?.message ?? 'That did not load.'}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loaded.reload()}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <div className="waiting-form">
      <RespondForm
        token={form.token}
        campaign={loaded.data}
        channel="home"
        embedded
        send={(body, key) => answer(form, body, key)}
        onSent={() => {
          dispatch(toastShown({ message: `Sent. Thank you for answering “${form.name}”.` }));
          onSent();
        }}
      />
    </div>
  );
}
