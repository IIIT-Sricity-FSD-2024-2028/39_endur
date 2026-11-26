// `/app/reflect`. The cycles, the form and the gap are RTK Query reads, and the open cycle is
// the URL's (`?campaign=`). Your answers, the plan being written and every write are
// `state.reflect` (store/screens/reflect.ts).
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { UpgradeCard } from '../../../components/billing/UpgradeCard.js';
import { QuestionInput, type Question } from '../../../components/form/QuestionInput.js';
import { GapBar } from '../../../components/data/GapBar.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { formatDate } from '../../../lib/format.js';
import { useCycles, useGap, useReflectionForm } from '../../../lib/reflect.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  EMPTY_PLAN,
  finaliseAsked,
  finaliseDismissed,
  planFinalised,
  planLineAdded,
  planLineEdited,
  planSaved,
  reflectCycleLeft,
  reflectionAnswered,
  reflectionSubmitted,
  selectReflectPage,
} from '../../../store/screens/reflect.js';

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
  // Leaving a cycle (for the list, another cycle, or another page) drops its drafts.
  useClearOnLeave(reflectCycleLeft({ campaignId: open }));

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

  if (!can('reflection.read') || cycles.forbidden) {
    return (
      <div className="page reflect-page">
        {header}
        <EmptyState
          icon="reflect"
          title="You do not have access to this"
          body="Your account cannot open the improve loop. Whoever administers your organization can change that."
        />
      </div>
    );
  }

  const upgrade = cycles.upgrade ?? form.upgrade ?? gap.upgrade;
  if (upgrade) {
    return (
      <div className="page reflect-page">
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
      <div className="page reflect-page">
        {header}
        {/* A real control, not a word. `btn-ghost` rendered "All cycles" at the same weight
            as the paragraph above it, so the only way out of a cycle looked like a caption
            — and the chevron pointed FORWARD, away from where it goes. */}
        <div className="reflect-back">
          <button type="button" className="btn btn-secondary btn-back" onClick={() => select(null)}>
            <Icon name="back" size={16} /> All cycles
          </button>
        </div>
        {/* THE ORDER. The form until it is submitted, the gap after — decided by what the
            server returned, never by a flag this page keeps. */}
        {gap.locked ? (
          <ReflectionForm campaignId={open} form={form} />
        ) : (
          <GapPanel campaignId={open} gap={gap} />
        )}
      </div>
    );
  }

  const rows = cycles.data ?? [];

  return (
    <div className="page reflect-page">
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
                <p className="cycle-facts text-meta">
                  <span>{cycle.subjectName}</span>
                  {cycle.endsAt && (
                    <span>
                      {cycle.closed ? 'closed' : 'ends'} {formatDate(cycle.endsAt)}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ReflectionForm({
  campaignId,
  form,
}: {
  campaignId: string;
  form: ReturnType<typeof useReflectionForm>;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectReflectPage(state, campaignId));
  const { answers, saving } = page;
  const error = messageOf(page.formError, 'That did not save.');

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
  const subjectId = form.data.subjectId;

  return (
    <section className="card panel reflect-form">
      <h3 className="panel-title">Your own assessment</h3>
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
          onChange={(value) =>
            dispatch(reflectionAnswered({ campaignId, questionId: question.id, value }))}
        />
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="text-meta">
        You can only record this once — it is what your results are compared against.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void dispatch(reflectionSubmitted({ campaignId, subjectId }))}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Record my assessment'}
      </button>
    </section>
  );
}

function GapPanel({
  campaignId,
  gap,
}: {
  campaignId: string;
  gap: ReturnType<typeof useGap>;
}): JSX.Element {
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectReflectPage(state, campaignId));
  const busy = page.planBusy;
  const error = messageOf(page.planError, 'That did not save.');

  if (gap.loading) return <p className="text-muted">Loading…</p>;
  if (!gap.data) return <p className="form-error" role="alert">That cycle is not here.</p>;

  const view = gap.data;
  const plan = view.plan;
  // What the editor shows: the draft once somebody edits, the saved plan until then.
  const draft = page.planItems ?? plan?.items ?? EMPTY_PLAN;
  const finalised = plan?.finalisedAt != null;

  return (
    <>
      <section className="card panel reflect-gap">
        <h3 className="panel-title">{view.campaignName}</h3>
        <p className="text-meta">
          Your assessment, recorded {formatDate(view.reflectedAt)} · {view.responseCount}{' '}
          response{view.responseCount === 1 ? '' : 's'}
        </p>

        {view.suppressed ? (
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

      <section className="card panel reflect-plan">
        <h3 className="panel-title">What you will do about it</h3>
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
                    dispatch(planLineEdited({ campaignId, index, patch: { text: event.target.value }, from: draft }))}
                />
                <input
                  type="date"
                  className="input"
                  value={item.dueAt ?? ''}
                  onChange={(event) =>
                    dispatch(planLineEdited({ campaignId, index, patch: { dueAt: event.target.value }, from: draft }))}
                />
              </div>
            ))}
            <div className="plan-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => dispatch(planLineAdded({ campaignId, from: draft }))}
              >
                <Icon name="add" size={16} /> Add another
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void dispatch(planSaved({ campaignId, from: draft }))}
                disabled={busy}
              >
                Save plan
              </button>
              {plan && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => dispatch(finaliseAsked({ campaignId }))}
                  disabled={busy}
                >
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

        {page.confirmingFinalise && plan && (
          <ConfirmDialog
            title="Finalise this plan?"
            consequence="It becomes a record of what you said you would do, and cannot be edited afterwards."
            verb="Finalise"
            onConfirm={() => void dispatch(planFinalised({ campaignId, planId: plan.id }))}
            onCancel={() => dispatch(finaliseDismissed({ campaignId }))}
          />
        )}

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
