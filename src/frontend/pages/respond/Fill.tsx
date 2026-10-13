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

const GENERIC_FAILURE = 'That did not go through. Your answers are still here — try again.';

export default function Fill(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

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
  const [pressed, setPressed] = useState(false);

  const key = useRef<string | null>(null);
  const cards = useRef<Record<string, HTMLElement | null>>({});

  const questions = useMemo(() => campaign?.questions ?? [], [campaign]);
  const subjects = campaign?.subjects ?? [];
  const needsSubject = subjects.length > 1;
  const missing = missingRequired(questions, answers);
  const answered = answeredCount(questions, answers);

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
  if (gate) {
    return (
      <Unavailable
        variant={gate.kind}
        organizationName={gate.organizationName}
        signInHref={token ? `/login?next=${encodeURIComponent(`/r/${token}`)}` : '/login'}
      />
    );
  }
  if (error || !campaign) return <Unavailable variant="error" onRetry={() => void reload()} />;

  const only = subjects.length === 1 ? subjects[0] : undefined;
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

const subjectName = (
  subjects: Array<{ id: string; name: string }>,
  chosen: string | undefined,
): string | undefined =>
  subjects.length === 1 ? subjects[0]?.name : subjects.find((s) => s.id === chosen)?.name;

function applyServerErrors(
  thrown: unknown,
  sentOrder: string[],
  setInvalid: (next: Record<string, string>) => void,
  setSubjectInvalid: (next: string | undefined) => void,
  setFailure: (next: string) => void,
): void {
  if (!(thrown instanceof ApiError)) return setFailure(GENERIC_FAILURE);

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
    if (id === undefined) rest.push(field.message);
    else perQuestion[id] = field.message;
  }
  setInvalid(perQuestion);
  if (rest.length > 0) setFailure(rest.join(' '));
}

const FormSkeleton = (): JSX.Element => (
  <div className="rf" aria-busy="true">
    <p className="sr-only">Loading</p>
    <div className="rf-skeleton" />
  </div>
);
