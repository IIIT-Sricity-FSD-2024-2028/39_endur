// /r/:token — THE HERO SCREEN. 39, design_specs/design/07 §7.1–§7.4.
//
// The only screen an evaluator touches with their own hands, on their own phone. Everything
// here is phone-first and the desktop is the same layout in a wider column — there is no
// second layout, on purpose.
//
// Four properties are load-bearing:
//
//   1. THE SAME <QuestionInput> SET AS THE PREVIEW (INV-008). Never a second implementation:
//      two of them means the builder's preview eventually lies about what respondents see,
//      and the first anyone hears of it is on stage.
//   2. NO STORE AND NO CHROME. The respond world mounts no providers (39 § State), so the
//      vocabulary comes from the payload rather than from useLabels(). A page that reached
//      for the store here would crash outside the console — which is what the tests prove
//      by rendering it with no <Provider> at all.
//   3. NOTHING IS VALIDATED UNTIL SUBMIT IS PRESSED. Inline red as you go is hostile on a
//      form somebody is filling in as a favour (39 § Validation).
//   4. THE WHOLE FORM ARRIVES IN ONE PAYLOAD. No lazy blocks, no spinner between questions:
//      on a venue network a second request is a second chance to fail (rule 7).
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AnswerValue } from '@endur/shared';
import { QuestionInput } from '../../components/form/QuestionInput.js';
import { ApiError } from '../../lib/api.js';
import {
  hasResponded, markResponded, submitKey, submitResponse, usePublicCampaign,
  type DoneState,
} from '../../lib/respond.js';
import { accessNotice, costLine } from './copy.js';
import { answeredCount, missingRequired, remainingLabel, toSubmitAnswers, type Answers } from './answers.js';
import { Unavailable } from './Unavailable.js';

/** The one sentence a respondent should never see, so it is written once and deliberately. */
const GENERIC_FAILURE = 'That did not go through. Your answers are still here — try again.';

export default function Fill(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // Read once, on mount. A marker found here skips the request entirely: a phone that has
  // already answered should get its answer instantly, not after a round trip.
  const [already] = useState(() => (token ? hasResponded(token) : false));
  const { campaign, loading, unavailable, gate, error, reload } = usePublicCampaign(
    already ? undefined : token,
  );

  const [answers, setAnswers] = useState<Answers>({});
  const [subjectId, setSubjectId] = useState<string | undefined>(undefined);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [subjectInvalid, setSubjectInvalid] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** The button only carries a count AFTER a press. Before that it says Submit (rule 4). */
  const [pressed, setPressed] = useState(false);

  // One key for this fill, minted at the first press and reused by every retry of it.
  // See submitKey() for why it is not derived from the token: everyone in the room holds
  // the same token.
  const key = useRef<string | null>(null);
  const cards = useRef<Record<string, HTMLElement | null>>({});

  const questions = useMemo(() => campaign?.questions ?? [], [campaign]);
  const subjects = campaign?.subjects ?? [];
  const needsSubject = subjects.length > 1;
  const missing = missingRequired(questions, answers);
  const answered = answeredCount(questions, answers);

  /** Clearing the error the instant the question is answered is 39 § Validation, verbatim. */
  const answer = useCallback((id: string, value: AnswerValue) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setInvalid((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const submit = async (): Promise<void> => {
    if (!token || !campaign || sending) return;
    setPressed(true);
    setFailure(null);

    const gaps = missingRequired(questions, answers);
    const noSubject = needsSubject && !subjectId;

    if (gaps.length > 0 || noSubject) {
      setInvalid(Object.fromEntries(gaps.map((id) => [id, 'Pick an answer to continue.'])));
      setSubjectInvalid(noSubject ? 'Choose one to continue.' : undefined);
      // Scroll to the FIRST one rather than marking them all and leaving the reader to
      // hunt. `?.()` because jsdom has no scrollIntoView and a test must not die on it.
      const first = noSubject ? 'subject' : gaps[0];
      const card = first ? cards.current[first] : null;
      card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      card?.querySelector<HTMLElement>('input, textarea')?.focus();
      return;
    }

    setInvalid({});
    setSubjectInvalid(undefined);
    setSending(true);
    key.current ??= submitKey(token);

    const sent = toSubmitAnswers(questions, answers);
    try {
      const result = await submitResponse(
        token,
        { answers: sent, channel: 'link', ...(subjectId ? { subjectId } : {}) },
        key.current,
      );
      markResponded(token);
      const about = subjectName(subjects, subjectId);
      const state: DoneState = {
        responseCount: result.responseCount,
        anonymous: campaign.anonymous,
        labels: campaign.labels,
        ...(about ? { subjectName: about } : {}),
      };
      // `replace`, so Back does not return to a filled-in form that would submit again.
      // Closing the tab is the correct end of this flow (39 § Thank you).
      navigate(`/r/${encodeURIComponent(token)}/done`, { state, replace: true });
    } catch (thrown) {
      setSending(false);
      applyServerErrors(
        thrown,
        sent.map((entry) => entry.questionId),
        setInvalid,
        setSubjectInvalid,
        setFailure,
      );
    }
  };

  if (already) return <Unavailable variant="responded" />;
  if (loading) return <FormSkeleton />;
  if (unavailable) return <Unavailable variant="unavailable" />;
  // AFTER `unavailable`, and the order is not arbitrary. A bad token 404s at the server
  // before `access` is ever consulted (12 §4.10c), so these two are reachable only with a
  // WORKING token — which is what keeps a restricted campaign from being an existence
  // oracle. Reading the branches in this order is reading that guarantee.
  if (gate) {
    return (
      <Unavailable
        variant={gate.kind}
        organizationName={gate.organizationName}
        // The `next` is the point: a respondent dropped on a bare login screen has been
        // sent away from the form somebody asked them to fill in.
        signInHref={token ? `/login?next=${encodeURIComponent(`/r/${token}`)}` : '/login'}
      />
    );
  }
  if (error || !campaign) return <Unavailable variant="error" onRetry={() => void reload()} />;

  const only = subjects.length === 1 ? subjects[0] : undefined;
  // <AccessNotice> (24 §7) — WHICH of the two promises this form is making, said on the
  // screen where it is made. `anonymityLine` alone said only half of it, and the half it
  // left out is the one an `organization` campaign gives up (52 §1).
  const anonymity = accessNotice({
    anonymous: campaign.anonymous,
    access: campaign.access,
    organizationName: campaign.organizationName,
  });
  const left = pressed ? remainingLabel(missing.length + (needsSubject && !subjectId ? 1 : 0)) : null;

  return (
    <div className="rf">
      {/* Counts QUESTIONS, not scroll. Scroll percentage lies on a form whose last
          question is a long text answer (rule 3). */}
      <div className="rf-progress">
        <div
          className="rf-progress-track"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={questions.length}
        >
          <div
            className="rf-progress-fill"
            style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }}
          />
        </div>
        <span className="rf-progress-count">{answered}/{questions.length}</span>
      </div>

      <form
        className="rf-form"
        // The browser's own required/invalid UI is exactly the inline red rule 4 rules out.
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="rf-head">
          <h1 className="rf-title">{campaign.campaignName}</h1>
          {only && <p className="rf-about">{only.name}</p>}
          <p className="rf-cost">
            {costLine({
              questionCount: questions.length,
              estimatedSeconds: campaign.estimatedSeconds,
              anonymous: campaign.anonymous,
            })}
          </p>
        </header>

        {needsSubject && (
          // Not drawn by 39 or by design_specs/design/07, both of which assume one subject.
          // A campaign may carry many (38 step 2), and the server 422s on `body.subjectId`
          // when it does and the submission does not say which — so the form has to ask.
          // Same card, same rhythm as a question, because that is what it is.
          <fieldset
            className={`q-card${subjectInvalid ? ' is-invalid' : ''}`}
            ref={(node) => { cards.current['subject'] = node; }}
          >
            <legend className="q-text">
              Which {campaign.labels.subject.one} is this about?
              <span className="q-star" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </legend>
            <div className="q-options">
              {subjects.map((subject) => (
                <label className="q-option" key={subject.id}>
                  <input
                    type="radio"
                    name="rf-subject"
                    checked={subjectId === subject.id}
                    onChange={() => {
                      setSubjectId(subject.id);
                      setSubjectInvalid(undefined);
                    }}
                  />
                  <span className="q-dot" aria-hidden="true" />
                  <span>{subject.name}</span>
                </label>
              ))}
            </div>
            {subjectInvalid && <p className="q-error" role="alert">{subjectInvalid}</p>}
          </fieldset>
        )}

        {questions.map((question) => (
          <div key={question.id} ref={(node) => { cards.current[question.id] = node; }}>
            <QuestionInput
              question={question}
              value={answers[question.id]}
              onChange={(value) => answer(question.id, value)}
              error={invalid[question.id]}
            />
          </div>
        ))}

        {failure && <p className="rf-failure" role="alert">{failure}</p>}

        <button type="submit" className="btn btn-primary rf-submit" disabled={sending}>
          {sending && <span className="spinner" aria-hidden="true" />}
          {/* After a failed press the button carries the count (07 §7.4) and STAYS live —
              pressing it again walks to the next unanswered question, which is the only
              useful thing it could do. */}
          {left ?? 'Submit'}
        </button>

        {/* Anonymity is stated twice — header and here. It is the thing that makes an
            honest answer possible and it costs two lines of copy (rule 6). */}
        {anonymity && <p className="rf-anon">{anonymity}</p>}
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

const subjectName = (
  subjects: Array<{ id: string; name: string }>,
  chosen: string | undefined,
): string | undefined =>
  subjects.length === 1 ? subjects[0]?.name : subjects.find((s) => s.id === chosen)?.name;

/**
 * The server's 422 is authoritative (14 §4) and arrives in the same shape as any other, so
 * it renders in the same places: a per-answer complaint goes under its own question, and
 * everything else goes above the button.
 *
 * `body.answers.3.value` names the answer's index in what WE sent, which is the array
 * `toSubmitAnswers` built — so the mapping back to a question id has to use that array, not
 * the question list, or an optional question the reader skipped shifts every path by one.
 */
function applyServerErrors(
  thrown: unknown,
  /** Question ids in the order they were SENT — `toSubmitAnswers`' output, not the form's. */
  sentOrder: string[],
  setInvalid: (next: Record<string, string>) => void,
  setSubjectInvalid: (next: string | undefined) => void,
  setFailure: (next: string) => void,
): void {
  if (!(thrown instanceof ApiError)) return setFailure(GENERIC_FAILURE);

  // A conflict here means this fill's key already produced a response: the first attempt
  // landed and its reply was lost on the way back. Saying "try again" would be wrong.
  if (thrown.code === 'CONFLICT') {
    return setFailure('Your answers were already recorded. There is nothing more to do.');
  }
  if (thrown.status === 404) {
    return setFailure('This is no longer accepting answers.');
  }
  if (thrown.fields.length === 0) {
    return setFailure(thrown.status >= 500 ? GENERIC_FAILURE : thrown.message);
  }

  const perQuestion: Record<string, string> = {};
  const rest: string[] = [];
  for (const field of thrown.fields) {
    if (field.path === 'body.subjectId') {
      setSubjectInvalid(field.message);
      continue;
    }
    const index = /^body\.answers\.(\d+)\./.exec(field.path)?.[1];
    const id = index === undefined ? undefined : sentOrder[Number(index)];
    // A path that names an index we did not send is not renderable next to any question.
    // It goes above the button rather than being dropped — a 422 nobody can see is a form
    // that refuses to submit and will not say why.
    if (id === undefined) rest.push(field.message);
    else perQuestion[id] = field.message;
  }
  setInvalid(perQuestion);
  if (rest.length > 0) setFailure(rest.join(' '));
}

/**
 * ONE skeleton, not one per question. The form arrives in a single payload, so there is no
 * moment where some of it is known and the rest is not — a per-question skeleton would be
 * an animation pretending to be progress (rule 7).
 */
const FormSkeleton = (): JSX.Element => (
  <div className="rf" aria-busy="true">
    <p className="sr-only">Loading</p>
    <div className="rf-skeleton" />
  </div>
);
