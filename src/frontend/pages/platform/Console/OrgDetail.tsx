// `/ops/orgs/:id`: one organisation, for an operator. The organisation is an RTK Query read;
// the plan override, suspension, support access and the message are `state.operator.orgs[id]`
// (store/screens/operator.ts), and each is a thunk there.
import { useNavigate, useParams } from 'react-router-dom';
import { PLAN_OPTIONS, SUPPORT_SESSION_MINUTES, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { PlanPicker } from '../../../components/billing/PlanPicker.js';
import { MessageComposer } from '../../../components/platform/MessageComposer.js';
import { useOrgDetail } from '../../../lib/estate.js';
import { useOpsCan } from '../../../lib/opsCapabilities.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { useClearOnLeave } from '../../../store/screens/common.js';
import {
  ORG_FAILED,
  SUPPORT_REASON_MIN,
  opsMessageOf,
  orgMessageEdited,
  orgMessaged,
  orgPageLeft,
  orgPlanSet,
  orgSuspendAsked,
  orgSuspendDismissed,
  orgSuspendNameTyped,
  orgSuspensionSet,
  orgTierPicked,
  selectOrgPage,
  supportReasonTyped,
  supportSessionEntered,
} from '../../../store/screens/operator.js';

export default function OrgDetail(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useOpsCan();
  const detail = useOrgDetail(id);
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectOrgPage(state, id));
  useClearOnLeave(orgPageLeft({ id }));
  const {
    pendingTier, planBusy, suspendOpen, suspendConfirmText, suspendBusy, supportReason,
    supportBusy, message, messageSending,
  } = page;
  const error = page.error ? opsMessageOf(page.error.error, ORG_FAILED[page.error.during]) : null;
  const setPendingTier = (tier: Tier | null): void => {
    dispatch(orgTierPicked({ id, tier }));
  };

  if (detail.forbidden) {
    return (
      <div className="fullpage">
        <div>
          <h3>You do not have access to this</h3>
          <p className="text-muted">Your operator account cannot open this organization.</p>
        </div>
      </div>
    );
  }
  if (detail.loading || !detail.data) {
    return <div className="fullpage"><p className="text-muted" aria-live="polite">Loading…</p></div>;
  }

  const org = detail.data;
  const suspended = org.suspendedAt !== null;
  const canSuspend = can('platform.org.suspend');

  const confirmPlan = (): void => {
    void dispatch(orgPlanSet(id));
  };

  const confirmSuspend = (): void => {
    void dispatch(orgSuspensionSet({ id, suspended, name: org.name }));
  };

  const enterConsole = (): void => {
    void dispatch(supportSessionEntered(id)).then((result) => {
      // Into the organisation's console, as a full page load: a different session.
      if (supportSessionEntered.fulfilled.match(result)) window.location.assign(result.payload);
    });
  };

  return (
    <div className="page">
      <PageHeader
        title={org.name}
        subtitle={`${org.industry} · ${org.slug}`}
        vocabulary={false}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/ops')}>
            Back to estate
          </button>
        }
      />

      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="stat-row">
        <StatCard kicker="Units" value={org.counts.units} />
        <StatCard kicker="Roles" value={org.counts.roles} />
        <StatCard kicker="People" value={org.counts.people} />
        <StatCard kicker="Subjects" value={org.counts.subjects} />
        <StatCard kicker="Campaigns" value={org.counts.campaigns} />
        <StatCard kicker="Responses" value={org.counts.responses} />
      </div>

      <div className="ops-sections">
        {/* Not `.card` — `.plan-card` already carries its own background/radius/shadow
            (same grid `Start.tsx` uses bare), so wrapping it in a second glass card here
            nested one surface inside another and squeezed the four tiers into a narrower
            box than every other plan grid on the product. */}
        <section className="ops-plan-section">
          <h3>Plan</h3>
          {/* WHEN IT RUNS OUT — DEC-113. The picker below says which tier; this says how long
              it lasts, which the operator console had no way to show at all until expiry
              became real. `70` § Data contract: the estate answers what the operator can act
              on, and "this one lapses on Thursday" is the most actionable fact about a plan.

              THE LAPSE LINE IS PAST TENSE AND NAMES THE OLD TIER. The picker already shows
              `bronze` as current, and an operator ringing a customer needs to know it is
              bronze BECAUSE Gold ran out, not because they chose it. */}
          <p className="text-meta ops-plan-period">
            {org.lapsedFrom
              ? `${org.lapsedFrom} ended without a renewal — this organization fell to ${org.tier}.`
              : org.periodEnd
                ? `Current period ends ${new Date(org.periodEnd).toLocaleDateString()}.`
                : 'No subscription row — reads as bronze everywhere.'}
          </p>
          <PlanPicker
            plans={PLAN_OPTIONS}
            current={org.tier}
            mode="override"
            onSelect={setPendingTier}
            busyTier={planBusy ? pendingTier : null}
          />
        </section>

        {pendingTier && (
          <ConfirmDialog
            title={`Change ${org.name} to ${pendingTier}?`}
            consequence={`This moves ${org.name} from ${org.tier} to ${pendingTier}. A downgrade retains data — surfaces stop resolving, but nothing is deleted. A downgrade never stops collection: a running campaign keeps running.`}
            verb="Change plan"
            onConfirm={confirmPlan}
            onCancel={() => setPendingTier(null)}
            confirmDisabled={planBusy}
          />
        )}

        <section className="card">
          <h3>Plan history</h3>
          {org.planHistory.length === 0 ? (
            <p className="text-meta">No plan changes recorded.</p>
          ) : (
            <ul className="plain-list">
              {org.planHistory.map((entry) => (
                <li key={entry.at}>
                  {new Date(entry.at).toLocaleString()} — set to {entry.tier} by {entry.by}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3>Administrators</h3>
          {org.administrators.length === 0 ? (
            <p className="text-meta">No administrator on record.</p>
          ) : (
            <ul className="plain-list">
              {org.administrators.map((person) => (
                <li key={person.id}>{person.name} · {person.email}</li>
              ))}
            </ul>
          )}
        </section>

        {/* SUPPORT ACCESS — DEC-114, `19` §15, `70` § Support access.

            ABSENT FOR AN OPERATOR WHO CANNOT USE IT, not disabled — the rule `DEC-104` set for
            the suspend card and for the same reason: a permanently-dead control teaches a
            support operator to distrust every greyed control they meet. `platform.support.enter`
            is held by both roles, so in practice this is present for everybody; the gate is
            here because the day it is narrowed, the card should vanish rather than mock. */}
        {can('platform.support.enter') && (
          <section className="card ops-support-card">
            <h3>Open this organization’s console</h3>
            <p className="text-meta">
              You will be signed in to {org.name} as yourself, for {SUPPORT_SESSION_MINUTES}{' '}
              minutes, under a banner they cannot dismiss. Responses, results, analysis and
              check-in notes stay closed to you — those refuse with a trace, not silently.
            </p>
            <label className="field ops-support-field">
              <span className="field-label">Why are you going in?</span>
              {/* REQUIRED, AND THE DISABLED BUTTON IS THE GUARD RATHER THAN AN EARLY RETURN
                  (`D-043`). The customer reads this sentence verbatim on every page for the
                  next hour, which is most of what separates this feature from the one `19` §14
                  refused — so the field is not a formality and the server's DTO enforces the
                  same minimum.

                  NO `#` BEFORE THE TICKET NUMBER IN THE PLACEHOLDER, and that is DEC-012's lint
                  rule earning its keep rather than a workaround: `#418` is a valid three-digit
                  hex colour and the selector flagged it. A false positive here, and exactly the
                  shape of the true positive it exists to catch. */}
              <input
                type="text"
                value={supportReason}
                onChange={(event) => dispatch(supportReasonTyped({ id, reason: event.target.value }))}
                placeholder="Ticket 418 — their campaign will not launch"
                maxLength={500}
              />
              <span className="field-hint">Shown to {org.name} on every page, in these words.</span>
            </label>
            <button
              type="button"
              className="btn btn-primary ops-support-submit"
              disabled={supportBusy || supportReason.trim().length < SUPPORT_REASON_MIN}
              onClick={enterConsole}
            >
              {supportBusy ? 'Opening…' : 'Open console'}
            </button>
          </section>
        )}

        <section className="card">
          <h3>Message the administrators</h3>
          <MessageComposer
            recipients={org.administrators}
            subject={message.subject}
            body={message.body}
            onEdit={(patch) => dispatch(orgMessageEdited({ id, ...patch }))}
            onSend={() => void dispatch(orgMessaged(id))}
            sending={messageSending}
          />
        </section>

        {/* ABSENT FOR STAFF, NOT DISABLED — `DEC-104`, and the whole SECTION goes: heading,
            explanation and button. A card headed "Suspend this organisation" that explains
            what suspension does and then offers nothing actionable is worse than the greyed
            button was. `70` already says the analytics tab is "absent, not disabled, for
            staff" and insists that absence is from the DOM rather than hidden by CSS; this
            was the one affordance on the surface that disagreed with that rule, and a
            permanently-dead control teaches a support operator to distrust every greyed
            control they meet.
            NOT A CHANGE TO THE SERVER. `POST /platform/orgs/:id/suspend` still answers 403 to
            staff from middleware and `70` § Acceptance still asserts it — which is exactly
            what makes removing the control a presentation decision rather than the rule
            (INV-003). */}
        {canSuspend && (
          <section className="card">
            <h3>{suspended ? 'Reinstate' : 'Suspend'} this organization</h3>
            <p className="text-meta">
              Suspension cuts staff sign-in and does not stop the respondent surface — a QR code
              on a wall keeps working.
            </p>
            <button type="button" className="btn btn-danger" onClick={() => dispatch(orgSuspendAsked({ id }))}>
              {suspended ? 'Reinstate organization' : 'Suspend organization'}
            </button>
          </section>
        )}
      </div>

      {/* Reinstating is a plain confirm. Suspending needs the typed-name pattern `32` uses
          for deleting a unit, which `<ConfirmDialog>` has no slot for — so this is the one
          dialog in the tree built inline rather than through it. */}
      {suspendOpen && suspended && (
        <ConfirmDialog
          title={`Reinstate ${org.name}?`}
          consequence={`Staff sign-in for ${org.name} is restored. The respondent surface was never affected.`}
          verb="Reinstate"
          confirmDisabled={suspendBusy}
          onConfirm={confirmSuspend}
          onCancel={() => dispatch(orgSuspendDismissed({ id }))}
        />
      )}
      {suspendOpen && !suspended && (
        <div className="dialog-backdrop" onMouseDown={() => dispatch(orgSuspendDismissed({ id }))}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="dialog-title">Suspend {org.name}?</h2>
            <p className="dialog-body">
              Staff at {org.name} will not be able to sign in. Campaigns keep running and the
              respondent surface is not affected — a QR code on a wall keeps working.
            </p>
            <label className="field">
              <span className="field-label">Type "{org.name}" to confirm</span>
              <input
                className="input"
                value={suspendConfirmText}
                onChange={(event) => dispatch(orgSuspendNameTyped({ id, text: event.target.value }))}
                autoFocus
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => dispatch(orgSuspendDismissed({ id }))}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={suspendBusy || suspendConfirmText !== org.name}
                onClick={confirmSuspend}
              >
                Suspend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
