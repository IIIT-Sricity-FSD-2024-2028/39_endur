// `/ops/orgs/:id`: one organisation, for an operator (`70`). R-716.
//
// WHERE EVERYTHING ON THIS PAGE LIVES:
// - the organisation: RTK Query's cache (`getOrgDetail`), read by `useOrgDetail`;
// - its activity and its support visits: the audit trail and the support register,
//   narrowed to this organisation (`getPlatformAudit`, `getSupportSessions`), drawn by
//   `selectAuditViewFor` and `selectSupportView` (store/screens/opsReports.ts);
// - the plan override, suspension, support access and the message: `state.operator.orgs[id]`
//   (store/screens/operator.ts), each command a thunk there.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PLAN_OPTIONS, SUPPORT_SESSION_MINUTES, type Tier } from '@endur/shared';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { PlanPicker } from '../../../components/billing/PlanPicker.js';
import { Icon } from '../../../components/Icon.js';
import { MessageComposer } from '../../../components/platform/MessageComposer.js';
import { Denied, Empty, OpsError, Pill, TierPill, initialsOf } from '../../../components/platform/OpsUi.js';
import { formatDate, formatDateTime, formatRelative } from '../../../lib/format.js';
import { useOrgDetail } from '../../../lib/estate.js';
import { useOpsCan } from '../../../lib/opsCapabilities.js';
import { usePlatformAudit, useSupportSessions } from '../../../lib/opsRegisters.js';
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
import {
  TIER_LABEL,
  auditFilterChanged,
  auditSearch,
  selectAuditViewFor,
  selectSupportView,
  supportSearch,
} from '../../../store/screens/opsReports.js';

/** How many of the organisation's latest operator actions the page shows. */
const ACTIVITY_SHOWN = 8;

const VISIT: Record<'active' | 'left' | 'expired', { label: string; tone: 'good' | undefined }> = {
  active: { label: 'Open now', tone: 'good' },
  left: { label: 'Left', tone: undefined },
  expired: { label: 'Ran out', tone: undefined },
};

export default function OrgDetail(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useOpsCan();
  const detail = useOrgDetail(id);
  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectOrgPage(state, id));
  useClearOnLeave(orgPageLeft({ id }));

  const activitySearch = auditSearch({ action: null, orgId: id, orgName: null });
  usePlatformAudit(activitySearch, can('platform.audit.read'));
  const activity = useAppSelector((state) => selectAuditViewFor(state, activitySearch));
  const visitSearch = supportSearch(id);
  useSupportSessions(visitSearch, can('platform.support.read'));
  const visits = useAppSelector((state) => selectSupportView(state, visitSearch, 'all'));

  const {
    pendingTier, planBusy, suspendOpen, suspendConfirmText, suspendBusy, supportReason,
    supportBusy, message, messageSending,
  } = page;
  const error = page.error ? opsMessageOf(page.error.error, ORG_FAILED[page.error.during]) : null;
  const setPendingTier = (tier: Tier | null): void => {
    dispatch(orgTierPicked({ id, tier }));
  };

  if (detail.forbidden) {
    return <Denied capability="platform.org.read" what="An organization's page" />;
  }
  if (detail.error && !detail.data) {
    return (
      <OpsError action={<Link className="btn btn-ghost btn-sm" to="/ops">Back to organizations</Link>}>
        {detail.error.message}
      </OpsError>
    );
  }
  if (detail.loading || !detail.data) {
    return (
      <div aria-live="polite">
        <div className="ops-skeleton" />
        <p className="sr-only">Loading…</p>
      </div>
    );
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

  const openTrail = (): void => {
    dispatch(auditFilterChanged({ action: '', orgId: id, orgName: org.name }));
    navigate('/ops/audit');
  };

  const counts: Array<[string, number]> = [
    ['Units', org.counts.units],
    ['Roles', org.counts.roles],
    ['People', org.counts.people],
    ['Subjects', org.counts.subjects],
    ['Campaigns', org.counts.campaigns],
    ['Responses', org.counts.responses],
  ];

  return (
    <>
      <Link className="ops-link text-meta" to="/ops">
        <Icon name="back" size={16} /> Organizations
      </Link>

      <section className="ops-hero card" aria-label="Organization">
        <span className="ops-hero-mark" aria-hidden="true">{initialsOf(org.name)}</span>
        <div className="ops-hero-text">
          <h1>{org.name}</h1>
          <div className="ops-pills">
            <TierPill tier={org.tier} label={TIER_LABEL[org.tier]} />
            {suspended ? <Pill tone="bad">Suspended</Pill> : <Pill tone="good">Staff can sign in</Pill>}
            {org.lapsedFrom && <Pill tone="warn">Lapsed from {TIER_LABEL[org.lapsedFrom]}</Pill>}
            <Pill>Subscription: {org.subscriptionStatus}</Pill>
          </div>
          <div className="ops-hero-meta">
            <span>{org.industry}</span>
            <span>{org.slug}</span>
            <span>Joined {formatDate(org.createdAt)}</span>
            <span>{org.lastActivityAt ? `Last active ${formatRelative(org.lastActivityAt)}` : 'No activity yet'}</span>
          </div>
        </div>
      </section>

      {error && <OpsError>{error}</OpsError>}

      <section className="ops-counts" aria-label="What it holds">
        {counts.map(([label, value]) => (
          <div className="ops-count-tile" key={label}>
            <p className="utility">{label}</p>
            <p className="ops-count-value">{value.toLocaleString()}</p>
          </div>
        ))}
      </section>

      <div className="ops-grid-main">
        <div className="ops-stack">
          <section className="ops-card card" aria-labelledby="plan">
            <div className="ops-card-head">
              <h2 id="plan">Plan</h2>
              {/* WHEN IT RUNS OUT (DEC-113), and a lapse in the past tense naming the old plan:
                  an operator ringing the customer needs to know it is Bronze BECAUSE Gold ran
                  out, not because they chose it. */}
              <p className="ops-card-note">
                {org.lapsedFrom
                  ? `${TIER_LABEL[org.lapsedFrom]} ended without a renewal; this organization fell to ${TIER_LABEL[org.tier]}.`
                  : org.periodEnd
                    ? `Current period ends ${formatDate(org.periodEnd)}.`
                    : 'No subscription row: reads as Bronze everywhere.'}
              </p>
            </div>
            <PlanPicker
              plans={PLAN_OPTIONS}
              current={org.tier}
              mode="override"
              onSelect={setPendingTier}
              busyTier={planBusy ? pendingTier : null}
              actions={can('platform.plan.override')}
            />
          </section>

          {pendingTier && (
            <ConfirmDialog
              title={`Change ${org.name} to ${TIER_LABEL[pendingTier]}?`}
              consequence={`This moves ${org.name} from ${TIER_LABEL[org.tier]} to ${TIER_LABEL[pendingTier]}. A downgrade keeps the data: surfaces stop resolving, nothing is deleted, and a running campaign keeps running.`}
              verb="Change plan"
              onConfirm={confirmPlan}
              onCancel={() => setPendingTier(null)}
              confirmDisabled={planBusy}
            />
          )}

          <section className="ops-card card" aria-labelledby="history">
            <div className="ops-card-head">
              <h2 id="history">Plan history</h2>
            </div>
            {org.planHistory.length === 0 ? (
              <Empty title="No plan changes recorded." />
            ) : (
              <ul className="ops-timeline">
                {org.planHistory.map((entry) => (
                  <li key={entry.at}>
                    <span className="ops-dot is-money" aria-hidden="true" />
                    <div>
                      <div className="ops-timeline-head">
                        <strong>Set to {TIER_LABEL[entry.tier]}</strong>
                        <span className="ops-timeline-when">{formatDateTime(entry.at)}</span>
                      </div>
                      <p className="ops-timeline-body">by {entry.by}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {can('platform.audit.read') && (
            <section className="ops-card card" aria-labelledby="activity">
              <div className="ops-card-head">
                <h2 id="activity">Operator activity</h2>
                <p className="ops-card-note">
                  {activity.total.toLocaleString()} action{activity.total === 1 ? '' : 's'} on record
                </p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={openTrail}>
                  Open in the audit trail
                </button>
              </div>
              {activity.rows.length === 0 ? (
                <Empty title="No operator has acted on this organization." />
              ) : (
                <ul className="ops-timeline">
                  {activity.rows.slice(0, ACTIVITY_SHOWN).map((row) => (
                    <li key={row.id}>
                      <span className={`ops-dot is-${row.tone}`} aria-hidden="true" />
                      <div>
                        <div className="ops-timeline-head">
                          <strong>{row.label}</strong>
                          <span className="text-meta">{row.actor?.name ?? 'An operator'}</span>
                          <span className="ops-timeline-when">{formatRelative(row.at)}</span>
                        </div>
                        {row.summary && <p className="ops-timeline-body">{row.summary}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {can('platform.support.read') && (
            <section className="ops-card card" aria-labelledby="visits">
              <div className="ops-card-head">
                <h2 id="visits">Support visits</h2>
                <p className="ops-card-note">
                  {visits.counts.all} in all · {visits.counts.active} open now
                </p>
              </div>
              {visits.rows.length === 0 ? (
                <Empty title="Nobody from Endur has entered this organization." />
              ) : (
                <ul className="ops-timeline">
                  {visits.rows.map((row) => (
                    <li key={row.id}>
                      <span className={`ops-dot ${row.status === 'active' ? 'is-team' : 'is-access'}`} aria-hidden="true" />
                      <div>
                        <div className="ops-timeline-head">
                          <strong>{row.operator.name}</strong>
                          <Pill tone={VISIT[row.status].tone}>{VISIT[row.status].label}</Pill>
                          <span className="ops-timeline-when">{formatDateTime(row.startedAt)}</span>
                        </div>
                        <p className="ops-timeline-body">
                          “{row.reason}”{row.minutes !== null ? ` · ${row.minutes} min` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="ops-stack">
          <section className="ops-card card" aria-labelledby="admins">
            <div className="ops-card-head">
              <h2 id="admins">Administrators</h2>
            </div>
            {org.administrators.length === 0 ? (
              <Empty title="No administrator on record." />
            ) : (
              <ul className="ops-people">
                {org.administrators.map((person) => (
                  <li key={person.id}>
                    <span className="ops-avatar" aria-hidden="true">{initialsOf(person.name)}</span>
                    <span>
                      <strong>{person.name}</strong>
                      <span>{person.email}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {can('platform.message.send') && (
            <section className="ops-card card" aria-labelledby="message">
              <div className="ops-card-head">
                <h2 id="message">Message the administrators</h2>
              </div>
              <MessageComposer
                recipients={org.administrators}
                subject={message.subject}
                body={message.body}
                onEdit={(patch) => dispatch(orgMessageEdited({ id, ...patch }))}
                onSend={() => void dispatch(orgMessaged(id))}
                sending={messageSending}
              />
            </section>
          )}

          {/* SUPPORT ACCESS (DEC-114). ABSENT, NOT DISABLED, for an operator who cannot use
              it (DEC-104): a permanently dead control teaches distrust of every greyed one. */}
          {can('platform.support.enter') && (
            <section className="ops-card card" aria-labelledby="enter">
              <div className="ops-card-head">
                <h2 id="enter">Open this organization’s console</h2>
              </div>
              <p className="text-meta">
                You will be signed in to {org.name} as yourself, for {SUPPORT_SESSION_MINUTES} minutes,
                under a banner they cannot dismiss. Responses, results, analysis and check-in notes stay
                closed to you.
              </p>
              <label className="ops-field">
                <span className="field-label">Why are you going in?</span>
                {/* REQUIRED: the customer reads this sentence on every page for the next hour,
                    and the server's DTO holds the same minimum. */}
                <input
                  className="input"
                  type="text"
                  value={supportReason}
                  onChange={(event) => dispatch(supportReasonTyped({ id, reason: event.target.value }))}
                  placeholder="Ticket 418: their campaign will not launch"
                  maxLength={500}
                />
                <span className="field-hint">Shown to {org.name} on every page, in these words.</span>
              </label>
              <div className="ops-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={supportBusy || supportReason.trim().length < SUPPORT_REASON_MIN}
                  onClick={enterConsole}
                >
                  {supportBusy ? 'Opening…' : 'Open console'}
                </button>
              </div>
            </section>
          )}

          {/* ABSENT FOR STAFF, NOT DISABLED (DEC-104). The server still refuses staff (INV-003);
              removing the control is presentation, not the rule. */}
          {canSuspend && (
            <section className="ops-card card ops-danger" aria-labelledby="suspend">
              <div className="ops-card-head">
                <h2 id="suspend">{suspended ? 'Reinstate' : 'Suspend'} this organization</h2>
              </div>
              <p className="text-meta">
                Suspension cuts staff sign-in and does not stop the respondent surface: a QR code on a
                wall keeps working.
              </p>
              <div className="ops-actions">
                <button type="button" className="btn btn-danger" onClick={() => dispatch(orgSuspendAsked({ id }))}>
                  {suspended ? 'Reinstate organization' : 'Suspend organization'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Reinstating is a plain confirm. Suspending needs the organisation's name typed, which
          <ConfirmDialog> has no slot for, so this one dialog is built inline. */}
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
            aria-labelledby="suspend-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="dialog-title" id="suspend-title">Suspend {org.name}?</h2>
            <p className="dialog-body">
              Staff at {org.name} will not be able to sign in. Campaigns keep running and the respondent
              surface is not affected: a QR code on a wall keeps working.
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
    </>
  );
}
