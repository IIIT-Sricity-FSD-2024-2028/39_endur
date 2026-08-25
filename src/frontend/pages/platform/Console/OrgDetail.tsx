// `/ops/orgs/:id` — `70` § Interactions "Opening one organisation", "Changing a plan",
// "Suspending an organisation", "Messaging the administrators".
//
// Metadata, the six counts, plan history, and the administrator list. NO RESULTS, NO
// RESPONSES, NO COMMENTS, and no link that could reach any (INV-011). `PlatformOrgDetail`
// carries no field that could.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PLAN_OPTIONS, type Tier } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Toast } from '../../../components/feedback/Toast.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { PlanPicker } from '../../../components/billing/PlanPicker.js';
import { MessageComposer } from '../../../components/platform/MessageComposer.js';
import { useOrgDetail } from '../../../lib/estate.js';
import { useOpsCan } from '../../../lib/opsCapabilities.js';
import { opsPost, OpsError } from '../../../lib/ops.js';

export default function OrgDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useOpsCan();
  const detail = useOrgDetail(id);

  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendConfirmText, setSuspendConfirmText] = useState('');
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [messageSending, setMessageSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (detail.forbidden) {
    return (
      <div className="fullpage">
        <div>
          <h3>You do not have access to this</h3>
          <p className="text-muted">Your operator account cannot open this organisation.</p>
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
    if (!pendingTier || !id) return;
    setPlanBusy(true);
    setError(null);
    void opsPost(`/orgs/${id}/plan`, { tier: pendingTier })
      .then(() => {
        setPendingTier(null);
        setToast(`Plan set to ${pendingTier}.`);
        return detail.reload();
      })
      .catch((err) => setError(err instanceof OpsError ? err.message : 'Could not change the plan.'))
      .finally(() => setPlanBusy(false));
  };

  const confirmSuspend = (): void => {
    if (!id || suspendConfirmText !== org.name) return;
    setSuspendBusy(true);
    setError(null);
    void opsPost(`/orgs/${id}/suspend`, { suspended: !suspended })
      .then(() => {
        setSuspendOpen(false);
        setSuspendConfirmText('');
        setToast(suspended ? 'Organisation reinstated.' : 'Organisation suspended.');
        return detail.reload();
      })
      .catch((err) => setError(err instanceof OpsError ? err.message : 'Could not change suspension.'))
      .finally(() => setSuspendBusy(false));
  };

  const sendMessage = async (subject: string, body: string): Promise<void> => {
    if (!id) return;
    setMessageSending(true);
    setError(null);
    try {
      const response = await opsPost<{ subject: string; body: string }, { data: { sentTo: number } }>(
        `/orgs/${id}/message`,
        { subject, body },
      );
      setToast(`Sent to ${response.data.sentTo} administrator${response.data.sentTo === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof OpsError ? err.message : 'Could not send the message.');
    } finally {
      setMessageSending(false);
    }
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
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="stat-grid">
        <StatCard kicker="Units" value={org.counts.units} />
        <StatCard kicker="Roles" value={org.counts.roles} />
        <StatCard kicker="People" value={org.counts.people} />
        <StatCard kicker="Subjects" value={org.counts.subjects} />
        <StatCard kicker="Campaigns" value={org.counts.campaigns} />
        <StatCard kicker="Responses" value={org.counts.responses} />
      </div>

      <section className="card">
        <h3>Plan</h3>
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

      <section className="card">
        <h3>Message the administrators</h3>
        <MessageComposer recipients={org.administrators} onSend={sendMessage} sending={messageSending} />
      </section>

      <section className="card">
        <h3>{suspended ? 'Reinstate' : 'Suspend'} this organisation</h3>
        <p className="text-meta">
          Suspension cuts staff sign-in and does not stop the respondent surface — a QR code
          on a wall keeps working.
        </p>
        {canSuspend ? (
          <button type="button" className="btn btn-danger" onClick={() => setSuspendOpen(true)}>
            {suspended ? 'Reinstate organisation' : 'Suspend organisation'}
          </button>
        ) : (
          <button type="button" className="btn btn-danger" disabled title="Owner only">
            {suspended ? 'Reinstate organisation' : 'Suspend organisation'}
          </button>
        )}
      </section>

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
          onCancel={() => setSuspendOpen(false)}
        />
      )}
      {suspendOpen && !suspended && (
        <div className="dialog-backdrop" onMouseDown={() => setSuspendOpen(false)}>
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
                onChange={(event) => setSuspendConfirmText(event.target.value)}
                autoFocus
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSuspendOpen(false);
                  setSuspendConfirmText('');
                }}
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
