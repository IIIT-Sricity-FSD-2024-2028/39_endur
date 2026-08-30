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
// ~~A DOWNGRADE CONFIRMS AND THEN PAYS~~ — THERE IS NO DOWNGRADE TO CONFIRM. DEC-096.
//
// The old sequence asked for the consequence first and the money second, and the reasoning
// was that asking for money first "produces a refund request in a product that has no
// refunds". THAT REASONING WAS RIGHT AND THE CONCLUSION WAS TOO SMALL: the product has no
// refunds, so a customer who moves down mid-period pays a SECOND time for LESS than they
// already hold, and both captures stay in an append-only ledger. A dialog that explained
// that accurately would be a dialog talking somebody out of a click the product should not
// offer.
//
// So the ladder is one-way while a period runs, a card below the current tier renders
// without an action, and `POST /billing/tier` answers 409 if anything calls it anyway —
// which is where the rule actually lives (INV-003).
//
// MOVING DOWN IS SCHEDULED FOR THE END OF THE PERIOD — DEC-098, and the affordance is UNDER
// THE CURRENT PLAN rather than back on a card. Two reasons, and neither is layout taste:
// <PlanPicker>'s rule is that a lower card carries no action, and a rule with one exception
// is a rule somebody adds a second exception to; and a scheduled change is a fact about THIS
// organisation's period, which is what the block above the picker is for. It reads with the
// date in it, because a promise without one is the thing customers ring about.
//
// AND IT IS NOT THE SAME KIND OF THING AS A JOIN, which is why it does not open the checkout.
// Nothing is captured at schedule time and nothing at apply time; the whole operation is a
// nullable column and a date the row already carried.
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

/**
 * "Bronze — Measure" is the CARD's name; a sentence wants "Bronze". The em dash split is
 * `16` §2's own format rather than a second copy of the tier names, so a renamed tier renames
 * here too — the alternative is a `Record<Tier, string>` that goes stale silently.
 */
const tierName = (plan: PlanOption | undefined): string =>
  plan ? (plan.name.split('—')[0]?.trim() ?? plan.name) : 'a lower plan';

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
  const scheduleDowngrade = useScheduleDowngrade();
  const cancelDowngrade = useCancelDowngrade();
  const enterprise = useEnterpriseRequest();

  const mayChange = can('billing.update');

  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  /** One flag for both directions of the schedule — only one of them can be in flight. */
  const [scheduling, setScheduling] = useState(false);
  /** The Enterprise ask, open or not. DEC-100 — a dialog, never a checkout. */
  const [asking, setAsking] = useState(false);
  const [askSending, setAskSending] = useState(false);
  /** The checkout, open on a tier. DEC-080. */
  const [paying, setPaying] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const summary = billing.data;
  const catalogue = plans.data ?? PLAN_OPTIONS;
  const current = catalogue.find((plan) => plan.tier === summary?.tier);
  /**
   * What a move down could go to. Every SELLABLE tier below the current one — Enterprise is
   * above all three, so `selectable` costs nothing here today and is the honest filter: a
   * tier the customer cannot assign themselves is not a tier they can schedule themselves
   * onto either (`DEC-099`). Empty on Bronze, and the block disappears rather than offering
   * a floor to fall to.
   */
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

  /**
   * An UPGRADE goes straight to the checkout. There is nothing else this can be — DEC-096,
   * and <PlanPicker> does not render an action on a card below the current tier.
   *
   * THE GUARD STAYS ANYWAY, and it is not defensive clutter: `onSelect` is a prop, this
   * component does not own the picker's rendering, and a rule that holds only because one
   * caller happens not to break it is a rule waiting for a second caller. The SERVER refuses
   * the same move with a 409 regardless (INV-003) — this just never asks it to.
   *
   * This is a COPY decision made from `tierRank`, never an authorisation one. What a tier
   * unlocks is still the server's answer, and the map that decides it never ships here.
   */
  const choose = (tier: Tier): void => {
    if (!summary) return;
    // ENTERPRISE IS ASKED FOR, NEVER BOUGHT — DEC-100. `<PlanPicker>` hands back a tier and
    // this decides what that means; routing it to the checkout would take ₹4,999 for a plan
    // the server would then refuse to assign (`joinTier` still answers 409 on it).
    const plan = catalogue.find((option) => option.tier === tier);
    if (plan && !plan.selectable) {
      setAsking(true);
      return;
    }
    if (tierRank(tier) <= tierRank(summary.tier)) return;
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

  /**
   * SCHEDULE, or CANCEL. `tier === null` is the cancel, and it is the same handler because
   * `49` § Interactions asks for the same control to do both jobs — a customer who scheduled
   * the wrong tier presses the one beside it, and the server overwrites rather than refusing.
   *
   * The summary is REPLACED, never patched. The read the server answers with may be the read
   * that fired an overdue downgrade, so the tier and the period can both have moved — merging
   * one field of it would render a pair that never coexisted (`49` § State).
   */
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

            {/* THE SCHEDULED MOVE DOWN — DEC-098, 49 § Interactions.
                It sits here, under the period it depends on, rather than on a card in the
                picker below: what it changes is not which plan you may buy, it is what happens
                to THIS period when it ends. The date is printed in both states because a
                promise without one is what customers ring about.
                Hidden entirely without `billing.update`, unlike the picker — the picker still
                answers "what are we on and what would the next one add", which is
                `billing.read`'s question; a schedule is only ever an action. */}
            {mayChange && (summary.pendingTier !== null || lowerTiers.length > 0) && (
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
          fromTier={summary.tier}
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
