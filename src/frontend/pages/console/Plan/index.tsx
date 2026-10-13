import { useState } from 'react';
import { PLAN_OPTIONS, tierRank, type BillingSummary, type PlanOption, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { PlanPicker } from '../../../components/billing/PlanPicker.js';
import { PaymentDialog } from '../../../components/billing/PaymentDialog.js';
import { EnterpriseRequestDialog } from '../../../components/billing/EnterpriseRequestDialog.js';
import { Toast } from '../../../components/feedback/Toast.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { ApiError } from '../../../lib/api.js';
import { formatDate } from '../../../lib/format.js';
import {
  useBilling,
  useCancelDowngrade,
  useEnterpriseRequest,
  useJoinTier,
  usePlans,
  useScheduleDowngrade,
} from '../../../lib/billing.js';
import { daysUntil } from '../../../components/billing/PlanNoticeBanner.js';

const tierName = (plan: PlanOption | undefined): string =>
  plan ? (plan.name.split('—')[0]?.trim() ?? plan.name) : 'a lower plan';

const STATUS_LABEL: Record<BillingSummary['status'], string> = {
  trialing: 'Trial',
  active: 'Active',
  cancelled: 'Cancelled',
};

export default function Plan(): JSX.Element {
  const can = useCan();
  const labels = useLabels();
  const billing = useBilling();
  const plans = usePlans();
  const join = useJoinTier();
  const scheduleDowngrade = useScheduleDowngrade();
  const cancelDowngrade = useCancelDowngrade();
  const enterprise = useEnterpriseRequest();

  const mayChange = can('billing.update');

  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askSending, setAskSending] = useState(false);
  const [paying, setPaying] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const summary = billing.data;
  const catalogue = plans.data ?? PLAN_OPTIONS;
  const current = catalogue.find((plan) => plan.tier === summary?.tier);
  const lowerTiers = summary
    ? catalogue.filter(
        (plan) => plan.selectable && tierRank(plan.tier) < tierRank(summary.tier),
      )
    : [];

  const apply = (tier: Tier, paymentRef?: string): void => {
    setBusyTier(tier);
    setError(null);
    setPaying(null);
    void join(tier, paymentRef)
      .then((updated) => {
        billing.set(updated);
        const name = catalogue.find((plan) => plan.tier === tier)?.name ?? tier;
        setToast(`You are on ${name}. It applies from your next action.`);
      })
      .catch((failed: unknown) =>
        setError(failed instanceof ApiError ? failed.message : 'Could not change the plan.'))
      .finally(() => setBusyTier(null));
  };

  const choose = (tier: Tier): void => {
    if (!summary) return;
    const plan = catalogue.find((option) => option.tier === tier);
    if (plan && !plan.selectable) {
      setAsking(true);
      return;
    }
    if (summary.status !== 'trialing' && tierRank(tier) <= tierRank(summary.tier)) return;
    setPaying(tier);
  };

  const ask = (note: string): void => {
    setAskSending(true);
    setError(null);
    void enterprise
      .request(note)
      .then(() => {
        setAsking(false);
        setToast('We have your request. Somebody from Endur will be in touch.');
      })
      .catch((failed: unknown) =>
        setError(failed instanceof ApiError ? failed.message : 'Could not send that request.'))
      .finally(() => setAskSending(false));
  };

  const schedule = (tier: Tier | null): void => {
    setScheduling(true);
    setError(null);
    void (tier === null ? cancelDowngrade() : scheduleDowngrade(tier))
      .then((updated) => {
        billing.set(updated);
        const name = catalogue.find((plan) => plan.tier === updated.pendingTier)?.name;
        setToast(
          name
            ? `${name} is scheduled for ${formatDate(updated.periodEnd)}. Nothing is charged today.`
            : 'That move is cancelled. Your plan stays as it is.',
        );
      })
      .catch((failed: unknown) =>
        setError(failed instanceof ApiError ? failed.message : 'Could not schedule that move.'))
      .finally(() => setScheduling(false));
  };

  if (billing.loading) {
    return (
      <>
        <PageHeader title="Plan" />
        <div className="settings-page" aria-hidden="true">
          <div className="card settings-skeleton">
            <span className="skeleton-row" /><span className="skeleton-row wide" />
          </div>
        </div>
      </>
    );
  }

  if (!summary) {
    return (
      <>
        <PageHeader title="Plan" />
        <p className="text-muted">
          {billing.error instanceof ApiError
            ? billing.error.message
            : 'Could not load your plan.'}
        </p>
      </>
    );
  }

  const buying: PlanOption | undefined = paying
    ? catalogue.find((plan) => plan.tier === paying)
    : undefined;

  return (
    <>
      <PageHeader
        title="Plan"
        subtitle="What this organisation is on, what it is using, and how to change it."
      />

      <div className="settings-page">
        <section className="settings-card" aria-labelledby="plan-current">
          <h3 className="utility" id="plan-current">Current plan</h3>

          <div className="card plan-current">
            <div className="plan-current-head">
              <div>
                <p className="plan-current-name">{current?.name ?? summary.tier}</p>
                <p className="text-muted">{current?.sells ?? 'Your plan.'}</p>
              </div>
              <span className={`tag tag-${summary.status === 'active' ? 'good' : 'muted'}`}>
                {STATUS_LABEL[summary.status]}
              </span>
            </div>

            {/* DEC-116. Days left is computed client-side from `periodEnd` with the same
                UTC-midnight care `daysUntil` already takes for the shell's own ending notice,
                rather than a second clock reading. */}
            {summary.status === 'trialing' && (
              <p className="text-meta plan-trial-days">
                {Math.max(0, daysUntil(summary.periodEnd))} day
                {Math.max(0, daysUntil(summary.periodEnd)) === 1 ? '' : 's'} left in your trial —
                add payment any time below to keep it going.
              </p>
            )}

            {/* The ladder. Four tiers in order, the current one marked — so "what could we
                move to, and in which direction" is answerable without reading four cards.
                It is the same information the picker below carries and it is deliberately
                NOT a second control: this row states where you are, the picker changes it. */}
            <ol className="plan-ladder" aria-label="Plans, smallest first">
              {PLAN_OPTIONS.map((plan) => {
                const here = plan.tier === summary.tier;
                const below = tierRank(plan.tier) < tierRank(summary.tier);
                return (
                  <li
                    key={plan.tier}
                    className={`plan-step${here ? ' is-here' : ''}${below ? ' is-below' : ''}`}
                  >
                    <span className="plan-step-dot" aria-hidden="true" />
                    <span className="plan-step-name">{plan.tier}</span>
                    {here && <span className="sr-only">Current plan</span>}
                  </li>
                );
              })}
            </ol>

            <dl className="plan-facts">
              <div>
                <dt className="text-meta">Seats in use</dt>
                <dd>
                  {summary.seats}
                  <span className="text-meta">
                    {' '}· {summary.seatBreakdown.activeUsers} people with accounts
                    {' '}+ {summary.seatBreakdown.nonPersonSubjects}{' '}
                    {labels.subject.many.toLowerCase()} that are not a person
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-meta">Period</dt>
                <dd>{formatDate(summary.periodStart)} — {formatDate(summary.periodEnd)}</dd>
              </div>
            </dl>

            {/* `16` §5, said where the customer reads it. "You have 34 seats" invites "34 of
                what?", and respondents never being counted is the seat model and the privacy
                model pointing the same way — worth one sentence rather than a footnote. */}
            <p className="text-meta plan-note-seats">
              {labels.respondent.many} answering your {labels.campaign.many.toLowerCase()} are
              never counted. Someone who is both a person and a{' '}
              {labels.subject.one.toLowerCase()} counts once.
            </p>

            {/* THE PLAN THAT RAN OUT — DEC-113, `16` §7d.
                Above the scheduled-move block and below the period, because it is a fact about
                the period that just ended. It is shown to EVERY reader with `billing.read`,
                unlike the block beneath it: what happened to the plan is not an action, and a
                reader who cannot change the plan still needs to know why the analysis pages
                stopped opening. The remedy it points at is the picker below, which already
                carries a Join on every tier above bronze — there is no separate renew button,
                because rejoining IS the join (`POST /billing/tier`, DEC-113). */}
            {summary.lapsedFrom && (
              <p className="plan-lapsed" role="status">
                <Icon name="plan" size={16} />
                <span>
                  Your <strong>{tierName(catalogue.find((plan) => plan.tier === summary.lapsedFrom))}</strong>{' '}
                  {/* DEC-116. "Your Gold TRIAL ended" vs "Your Gold PLAN ended" — a trial never
                      had money flowing, so the paid-lapse sentence would misstate what happened. */}
                  {summary.lapsedFromTrial ? 'trial' : 'plan'} ended and this organisation moved to{' '}
                  <strong>{tierName(catalogue.find((plan) => plan.tier === summary.tier))}</strong>.
                  Nothing you have collected has been deleted — choose a plan below to get those
                  screens back.
                </span>
              </p>
            )}

            {/* THE SCHEDULED MOVE DOWN — DEC-098, 49 § Interactions.
                It sits here, under the period it depends on, rather than on a card in the
                picker below: what it changes is not which plan you may buy, it is what happens
                to THIS period when it ends. The date is printed in both states because a
                promise without one is what customers ring about.
                Hidden entirely without `billing.update`, unlike the picker — the picker still
                answers "what are we on and what would the next one add", which is
                `billing.read`'s question; a schedule is only ever an action. */}
            {/* DEC-116. Not offered during a trial: nothing has been paid for, so there is
                nothing to schedule a move down FROM — the server refuses it too (409), this
                just never asks. */}
            {mayChange && summary.status !== 'trialing' &&
              (summary.pendingTier !== null || lowerTiers.length > 0) && (
              <div className="plan-schedule">
                {summary.pendingTier ? (
                  <p className="plan-schedule-line text-meta">
                    <Icon name="plan" size={16} />
                    <span>
                      Moving to{' '}
                      <strong>
                        {tierName(catalogue.find((plan) => plan.tier === summary.pendingTier))}
                      </strong>{' '}
                      when this period ends on {formatDate(summary.periodEnd)}. Nothing is
                      charged, and nothing you have collected is deleted.
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={scheduling}
                      onClick={() => schedule(null)}
                    >
                      Cancel
                    </button>
                  </p>
                ) : (
                  <p className="plan-schedule-line text-meta">
                    <span>
                      Moving down waits for the end of the period — there are no refunds
                      part-way through one. Schedule it for {formatDate(summary.periodEnd)}:
                    </span>
                    {lowerTiers.map((plan) => (
                      <button
                        key={plan.tier}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={scheduling}
                        onClick={() => schedule(plan.tier)}
                      >
                        Move to {tierName(plan)}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="plan-change">
          <h3 className="utility" id="plan-change">Change plan</h3>
          <p className="text-muted">
            A plan is one month, billed once, and applies as soon as it is paid. Moving up
            charges the difference for the rest of this period. Nothing you have collected is
            deleted, and running {labels.campaign.many.toLowerCase()} keep running whichever
            plan you are on.
          </p>

          {error && <p className="form-error" role="alert">{error}</p>}

          {/* Without `billing.update` the picker is inert rather than absent: knowing which
              plan you are on and what the next one adds is `billing.read`'s answer, and
              hiding it would leave an administrator's colleague unable to say what to ask
              for. The buttons are what the capability gates. */}
          <PlanPicker
            plans={catalogue}
            current={summary.tier}
            mode="join"
            busyTier={busyTier}
            requestedTier={enterprise.requestedAt ? 'enterprise' : null}
            disabled={!mayChange}
            belowIsLive={summary.status === 'trialing'}
            onSelect={choose}
          />

          {!mayChange && (
            <p className="text-meta">
              <Icon name="role" size={16} /> Changing the plan needs the billing permission.
              An administrator can do it from this page.
            </p>
          )}
        </section>
      </div>

      {buying && summary && (
        <PaymentDialog
          plan={buying}
          mode="change"
          fromTier={summary.status === 'trialing' ? null : summary.tier}
          onPaid={(reference) => apply(buying.tier, reference)}
          onCancel={() => setPaying(null)}
        />
      )}

      {asking && (
        <EnterpriseRequestDialog
          plan={catalogue.find((plan) => plan.tier === 'enterprise') ?? PLAN_OPTIONS[3]!}
          sending={askSending}
          onSend={ask}
          onCancel={() => setAsking(false)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
