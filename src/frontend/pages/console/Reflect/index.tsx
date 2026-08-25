// T-084 — /app/reflect. 44.
//
// THE ORDER IS THE PRODUCT. You record your own assessment first, then you are shown what
// everybody else said, then you write a plan. The lock is the API's (`GET .../gap` 404s
// until the reflection exists), so this page cannot open the gap early even if it tried —
// and it does not try: the locked state says plainly what unlocks it, because `44` § States
// forbids a bare empty screen here.
//
// One route with three views, chosen by the URL. `?campaign=` is which cycle; everything
// else follows from what the server says about it.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AnswerValue, PlanItem } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { UpgradeCard } from '../../../components/billing/UpgradeCard.js';
import { QuestionInput, type Question } from '../../../components/form/QuestionInput.js';
import { GapBar } from '../../../components/data/GapBar.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { formatDate } from '../../../lib/format.js';
import { ApiError } from '../../../lib/api.js';
import {
  finalisePlan,
  savePlan,
  submitReflection,
  useCycles,
  useGap,
  useReflectionForm,
} from '../../../lib/reflect.js';

const STATUS: Record<string, { label: string; className: string }> = {
  due: { label: 'Your turn', className: 'tag tag-warn' },
  reflected: { label: 'Reflected', className: 'tag tag-neutral' },
  planned: { label: 'Plan written', className: 'tag tag-neutral' },
  finalised: { label: 'Finalised', className: 'tag tag-good' },
};

export default function Reflect(): JSX.Element {
  const can = useCan();
  const labels = useLabels();
  const [params, setParams] = useSearchParams();
  const open = params.get('campaign');

  const cycles = useCycles(can('reflection.read'));
  const form = useReflectionForm(open);
  const gap = useGap(open);

  const select = (campaignId: string | null): void => {
    const next = new URLSearchParams(params);
    if (campaignId) next.set('campaign', campaignId);
    else next.delete('campaign');
    setParams(next, { replace: true });
  };

  const header = (
    <PageHeader
      title="Reflect"
      subtitle="Record how you think it went, then see how that compares with what people said."
    />
  );

  // 403 — the account. L4 holds none of this and the sidebar item is hidden for them, so
  // anybody here typed the address.
  if (!can('reflection.read') || cycles.forbidden) {
    return (
      <div className="page">
        {header}
        <EmptyState
          icon="reflect"
          title="You do not have access to this"
          body="Your account cannot open the improve loop. Whoever administers your organisation can change that."
        />
      </div>
    );
  }

  // 402 — the organisation. Not an error page, and never the sentence above (DEC-011).
  const upgrade = cycles.upgrade ?? form.upgrade ?? gap.upgrade;
  if (upgrade) {
    return (
      <div className="page">
        {header}
        <UpgradeCard
          requiredTier={upgrade.requiredTier}
          currentTier={upgrade.currentTier}
          icon="reflect"
          sells="the loop that turns feedback into something you actually do"
        />
      </div>
    );
  }

  if (open) {
    return (
      <div className="page">
        {header}
        <button type="button" className="btn btn-ghost" onClick={() => select(null)}>
          <Icon name="disclosure" size={16} /> All cycles
        </button>
        {/* THE ORDER. The form until it is submitted, the gap after — decided by what the
            server returned, never by a flag this page keeps. */}
        {gap.locked ? (
          <ReflectionForm campaignId={open} form={form} onDone={() => void gap.reload()} />
        ) : (
          <GapPanel campaignId={open} gap={gap} />
        )}
      </div>
    );
  }

  const rows = cycles.data ?? [];

  return (
    <div className="page">
      {header}
      {cycles.loading && rows.length === 0 ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="reflect"
          title="Nothing to reflect on yet"
          body={`Cycles appear here once a ${labels.campaign.one.toLowerCase()} is running about you.`}
          action={<Link className="btn btn-secondary" to="/app">Back to home</Link>}
        />
      ) : (
        <ul className="cycle-list">
          {rows.map((cycle) => {
            const tag = STATUS[cycle.status] ?? STATUS['due'];
            return (
              <li key={`${cycle.campaignId}:${cycle.subjectId}`} className="card cycle-row">
                <button type="button" className="cycle-open" onClick={() => select(cycle.campaignId)}>
                  {cycle.campaignName}
                </button>
                <span className={tag?.className}>{tag?.label}</span>
                <span className="text-meta">{cycle.subjectName}</span>
                {cycle.endsAt && (
                  <span className="text-meta">
                    {cycle.closed ? 'closed' : 'ends'} {formatDate(cycle.endsAt)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ step 1: the reflection */

function ReflectionForm({
  campaignId,
  form,
  onDone,
}: {
  campaignId: string;
  form: ReturnType<typeof useReflectionForm>;
  onDone: () => void;
}): JSX.Element {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (form.loading) return <p className="text-muted">Loading…</p>;
  if (!form.data) return <p className="form-error" role="alert">That cycle is not here.</p>;

  const questions: Question[] = form.data.questions.map((question) => ({
    id: question.id,
    kind: question.kind as Question['kind'],
    text: question.text,
    config: question.config as Question['config'],
    required: question.required,
    position: question.position,
  }));

  const submit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await submitReflection(campaignId, {
        subjectId: form.data?.subjectId ?? '',
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
      });
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card reflect-form">
      <h3>Your own assessment</h3>
      {/* SAID BEFORE THEY START, not after they submit. The reason the order matters is the
          reason somebody would otherwise resent being made to go first. */}
      <p className="text-muted">
        Answer these before you see anyone else&apos;s. That is what makes the comparison worth
        anything — scores first would turn this into an explanation of them.
      </p>
      {/* THE SAME SIX INPUTS THE RESPONDENT SAW (INV-008), on the campaign's own questions.
          A parallel "reflection form" would be comparing two different instruments. */}
      {questions.map((question) => (
        <QuestionInput
          key={question.id}
          question={question}
          value={answers[question.id]}
          onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
        />
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="text-meta">
        You can only record this once — it is what your results are compared against.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
        {saving ? 'Saving…' : 'Record my assessment'}
      </button>
    </section>
  );
}

/* ------------------------------------------------- steps 2 and 3: the gap, then the plan */

function GapPanel({
  campaignId,
  gap,
}: {
  campaignId: string;
  gap: ReturnType<typeof useGap>;
}): JSX.Element {
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gap.loading) return <p className="text-muted">Loading…</p>;
  if (!gap.data) return <p className="form-error" role="alert">That cycle is not here.</p>;

  const view = gap.data;
  const plan = view.plan;
  const draft = items ?? plan?.items ?? [{ text: '', status: 'open' as const }];
  const finalised = plan?.finalisedAt != null;

  const write = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await savePlan(campaignId, { items: draft.filter((item) => item.text.trim().length > 0) });
      setItems(null);
      await gap.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const seal = async (): Promise<void> => {
    if (!plan) return;
    setBusy(true);
    try {
      await finalisePlan(plan.id);
      await gap.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card reflect-gap">
        <h3>{view.campaignName}</h3>
        <p className="text-meta">
          Your assessment, recorded {formatDate(view.reflectedAt)} · {view.responseCount}{' '}
          response{view.responseCount === 1 ? '' : 's'}
        </p>

        {view.suppressed ? (
          // The same gate as everywhere, and worded as the promise it is rather than as a
          // failure. Their own reflection is still theirs; it is the others' answers that
          // are withheld (52 §2).
          <>
            <h4>Not enough responses yet</h4>
            <p className="text-muted">
              The comparison appears once {view.threshold} people have answered.{' '}
              {view.responseCount} so far. Below that, an average and a comment together can
              identify who wrote it.
            </p>
          </>
        ) : (
          <>
            <p className="text-muted">
              Where these differ is the useful part. Rating yourself higher than others did is
              a blind spot; lower is under-confidence. Neither is a mark against you.
            </p>
            {(view.rows ?? []).map((row) => (
              <GapBar
                key={row.questionId}
                label={row.text}
                self={row.self}
                received={row.received}
                max={row.scaleMax}
              />
            ))}
          </>
        )}
      </section>

      <section className="card reflect-plan">
        <h3>What you will do about it</h3>
        {finalised ? (
          <>
            <p className="text-meta">
              Finalised {formatDate(plan?.finalisedAt ?? '')} — this is a record now and cannot
              be edited.
            </p>
            <ul className="plan-list">
              {(plan?.items ?? []).map((item, index) => (
                <li key={`${item.text}:${index}`}>{item.text}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {draft.map((item, index) => (
              <div key={index} className="plan-item">
                <input
                  className="input"
                  value={item.text}
                  placeholder="One thing you will change"
                  onChange={(event) =>
                    setItems(
                      draft.map((row, at) =>
                        at === index ? { ...row, text: event.target.value } : row,
                      ),
                    )
                  }
                />
                <input
                  type="date"
                  className="input"
                  value={item.dueAt ?? ''}
                  onChange={(event) =>
                    setItems(
                      draft.map((row, at) =>
                        at === index ? { ...row, dueAt: event.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <div className="plan-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setItems([...draft, { text: '', status: 'open' }])}
              >
                <Icon name="add" size={16} /> Add another
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void write()} disabled={busy}>
                Save plan
              </button>
              {plan && (
                <button type="button" className="btn btn-primary" onClick={() => void seal()} disabled={busy}>
                  Finalise
                </button>
              )}
            </div>
            {plan && (
              <p className="text-meta">
                Finalising is permanent. After it, this plan is evidence rather than a draft.
              </p>
            )}
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}

        {(plan?.checkins ?? []).length > 0 && (
          <div className="checkin-list">
            <h4>Check-ins</h4>
            {(plan?.checkins ?? []).map((checkin) => (
              <p key={checkin.id} className="text-meta">
                {checkin.supervisorName}
                {checkin.heldAt ? ` · ${formatDate(checkin.heldAt)}` : ''}
                {checkin.notes ? ` — ${checkin.notes}` : ''}
              </p>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
