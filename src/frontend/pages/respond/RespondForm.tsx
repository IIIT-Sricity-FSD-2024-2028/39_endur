// The form a respondent fills in, without the page around it.
//
// Two homes: `/r/:token` (Fill, a phone that scanned a code) and the card on a signed-in
// member's Home page. ONE copy of the rules — what is required, the subject question, the
// "2 questions left" button, the server's field errors — because two copies of a form's
// validation are two answers to "why did this not send".
//
// Its state is the store's: `state.respond.fills[token]` (store/screens/respond.ts). Every
// answer is an `answerGiven` action, the press is `fillSubmitPressed`, and the send is the
// `answersSubmitted` thunk over RTK Query. docs/REDUX-PLAN.md §6.10 (R-704, DEC-R03).
import { useCallback, useMemo, useRef } from 'react';
import type { AnswerValue, PublicCampaign, SubmitResponseBody } from '@endur/shared';
import { QuestionInput } from '../../components/form/QuestionInput.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { useClearOnLeave } from '../../store/screens/common.js';
import {
  answerGiven,
  answersSubmitted,
  fillLeft,
  fillSubmitPressed,
  selectFill,
  subjectChosen,
} from '../../store/screens/respond.js';
import type { SubmitResult } from '../../lib/respond.js';
import { accessNotice, costLine } from './copy.js';
import { answeredCount, missingRequired, remainingLabel, toSubmitAnswers } from './answers.js';

export function RespondForm({
  token,
  campaign,
  channel,
  campaignId,
  onSent,
  embedded = false,
}: {
  token: string;
  campaign: PublicCampaign;
  channel: SubmitResponseBody['channel'];
  /** Answering from Home: the card, Home's counts and the campaign re-read afterwards. */
  campaignId?: string;
  onSent: (result: SubmitResult, subjectName: string | undefined) => void;
  /** Inside a card on a page that already names the form: no title card of its own. */
  embedded?: boolean;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const fill = useAppSelector((state) => selectFill(state, token));
  // The fill goes when the form does (the page left, the card folded), as it used to.
  useClearOnLeave(fillLeft({ token }));
  const { answers, invalid, failure, sending, pressed } = fill;
  const subjectId = fill.subjectId ?? undefined;
  const subjectInvalid = fill.subjectInvalid ?? undefined;

  // DOM handles for "scroll to the first gap", not state: nothing renders from them.
  const cards = useRef<Record<string, HTMLElement | null>>({});

  const questions = useMemo(() => campaign.questions, [campaign]);
  const subjects = campaign.subjects;
  const needsSubject = subjects.length > 1;
  const missing = missingRequired(questions, answers);
  const answered = answeredCount(questions, answers);

  const answer = useCallback(
    (id: string, value: AnswerValue) => dispatch(answerGiven({ token, questionId: id, value })),
    [dispatch, token],
  );

  const submit = (): void => {
    if (sending) return;
    const gaps = missingRequired(questions, answers);
    const noSubject = needsSubject && !subjectId;
    dispatch(fillSubmitPressed(token, gaps, noSubject));

    if (gaps.length > 0 || noSubject) {
      const first = noSubject ? 'subject' : gaps[0];
      const card = first ? cards.current[first] : null;
      card?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      card?.querySelector<HTMLElement>('input, textarea')?.focus();
      return;
    }

    const sent = toSubmitAnswers(questions, answers);
    void dispatch(
      answersSubmitted({
        token,
        body: { answers: sent, channel, ...(subjectId ? { subjectId } : {}) },
        sentOrder: sent.map((entry) => entry.questionId),
        ...(campaignId ? { campaignId } : {}),
      }),
    ).then((result) => {
      if (answersSubmitted.fulfilled.match(result)) {
        onSent({ responseCount: result.payload.responseCount }, subjectName(subjects, subjectId));
      }
    });
  };

  const only = subjects.length === 1 ? subjects[0] : undefined;
  const anonymity = accessNotice({
    anonymous: campaign.anonymous,
    access: campaign.access,
    organizationName: campaign.organizationName,
  });
  const left = pressed ? remainingLabel(missing.length + (needsSubject && !subjectId ? 1 : 0)) : null;
  // Unique per form, so two open on one page never share radio groups.
  const subjectGroup = `rf-subject-${token}`;

  return (
    <div className={`rf${embedded ? ' rf-embedded' : ''}`}>
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
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {!embedded && (
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
        )}

        {needsSubject && (
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
                    name={embedded ? subjectGroup : 'rf-subject'}
                    checked={subjectId === subject.id}
                    onChange={() => dispatch(subjectChosen({ token, subjectId: subject.id }))}
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

const subjectName = (
  subjects: Array<{ id: string; name: string }>,
  chosen: string | undefined,
): string | undefined =>
  subjects.length === 1 ? subjects[0]?.name : subjects.find((s) => s.id === chosen)?.name;
