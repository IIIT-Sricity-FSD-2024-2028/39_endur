// /app/plan — the plan this organisation is on, and how to change it. 49.
//
// WHY THIS IS A NAV ITEM AND NOT A SETTINGS TAB. `49` § Route & access puts the page at
// `/app/settings/billing` and argues for a tab: billing is looked at monthly, and the
// sidebar's groups are things people DO. The owner asked for it in the sidebar instead, so
// it is in the sidebar — under `system`, beside Settings and the activity log, which is
// where the furniture of the product lives rather than in Organize / Collect / Understand.
// The doc's argument is recorded here rather than deleted: if the sidebar ever gets long
// enough that this is the item to cut, `49` already says where it goes.
//
// A PLAN IS BOUGHT AGAIN — DEC-080 supersedes DEC-035. The picker prints a price and the
// checkout takes the (simulated) payment; what has NOT changed is where the decision is
// made. `POST /billing/tier` behind `billing.update` is still the authoritative write, and
// <PaymentDialog> is a step in front of it rather than a condition on it.
//
// A DOWNGRADE CONFIRMS AND THEN PAYS, in that order. The confirmation is about what stops
// resolving, and it has to be answered before somebody is shown a price for it — asking for
// money first and explaining the consequence second is the sequence that produces a refund
// request in a product that has no refunds.
import { useState } from 'react';
import { PLAN_OPTIONS, tierRank, type BillingSummary, type PlanOption, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { PlanPicker } from '../../../components/billing/PlanPicker.js';
import { PaymentDialog } from '../../../components/billing/PaymentDialog.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Toast } from '../../../components/feedback/Toast.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { ApiError } from '../../../lib/api.js';
import { formatDate } from '../../../lib/format.js';
import { useBilling, useJoinTier, usePlans } from '../../../lib/billing.js';

const STATUS_LABEL: Record<BillingSummary['status'], string> = {
  trialing: 'Trial',
  active: 'Active',
  cancelled: 'Cancelled',
};

export default function Plan(): JSX.Element {
  const can = useCan();
  // INV-001. A hotel reads "Guests answering your Review rounds are never counted", and a
  // seat breakdown that says "subjects" to a hotel is the product speaking its own language
  // at a customer. Only the structural words here — Plan, Seats, Period — stay literal.
  const labels = useLabels();
  const billing = useBilling();
  const plans = usePlans();
  const join = useJoinTier();

  const mayChange = can('billing.update');

  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [confirming, setConfirming] = useState<Tier | null>(null);
  /** The checkout, open on a tier. DEC-080. */
  const [paying, setPaying] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const summary = billing.data;
  const catalogue = plans.data ?? PLAN_OPTIONS;
  const current = catalogue.find((plan) => plan.tier === summary?.tier);

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
      .finally(() => {
        setBusyTier(null);
        setConfirming(null);
      });
  };

  /**
   * An UPGRADE applies with no dialog; a DOWNGRADE confirms — `49` § Interactions. The
   * asymmetry is the point: confirming before giving somebody more is friction with no risk
   * behind it, and a downgrade takes surfaces away, so the sentence has to say what happens
   * to the work already done.
   *
   * This is a COPY decision made from `tierRank`, never an authorisation one. What a tier
   * unlocks is still the server's answer, and the map that decides it never ships here.
   */
  const choose = (tier: Tier): void => {
    if (!summary || tier === summary.tier) return;
    if (tierRank(tier) < tierRank(summary.tier)) setConfirming(tier);
    else setPaying(tier);
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

  const leaving = confirming ? catalogue.find((plan) => plan.tier === confirming) : undefined;
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
          </div>
        </section>

        <section className="settings-card" aria-labelledby="plan-change">
          <h3 className="utility" id="plan-change">Change plan</h3>
          <p className="text-muted">
            A plan is one year, billed once, and applies as soon as it is paid. Nothing you
            have collected is deleted, and running{' '}
            {labels.campaign.many.toLowerCase()} keep running whichever plan you are on.
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
            disabled={!mayChange}
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

      {confirming && leaving && (
        <ConfirmDialog
          title={`Move to ${leaving.name}?`}
          consequence={
            `${current?.adds ?? 'The current plan’s extra surfaces'} stops resolving. ` +
            'Nothing is deleted — every response, result and analysis you have stays, and ' +
            'rejoining the higher plan brings the same history back.'
          }
          verb={`Move to ${leaving.name}`}
          confirmDisabled={busyTier !== null}
          onConfirm={() => {
            // Consequence answered; now the price. The confirm dialog closes so the reader
            // is never looking at two stacked dialogs.
            setConfirming(null);
            setPaying(confirming);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {buying && summary && (
        <PaymentDialog
          plan={buying}
          mode="change"
          fromTier={summary.tier}
          onPaid={(reference) => apply(buying.tier, reference)}
          onCancel={() => setPaying(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
