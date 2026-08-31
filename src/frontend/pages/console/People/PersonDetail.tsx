// /app/people/:id — one person. 34 § Interactions, design_specs/design/04 §4.4.
//
// Three blocks, in this order and for this reason: **identity, positions, then what those
// positions actually confer.** The third is the payload. Everywhere else in the product the
// scoping model is a paragraph of documentation; here it is a rendered fact — the same
// person, two units, different powers, which is INV-005 without the paragraph.
//
// It shares that block with `/app/profile` (47) rather than owning a copy: `<PowersByPlace>`,
// one implementation, two placements (24 §4). What differs is who is reading. Here it is an
// administrator looking at somebody else, and the read is scope-filtered by the API — a
// person outside the caller's scope 404s rather than 403ing, so ids cannot be probed to map
// the org chart (13 §5).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AccountInvite, AccountStatus, CreateAssignmentBody } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { InviteLink } from '../../../components/feedback/InviteLink.js';
import { InlineName } from '../../../components/org/InlineName.js';
import { PowersByPlace } from '../../../components/org/PowersByPlace.js';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { usePerson, useRoles } from '../../../lib/people.js';
import { inviteAccount, resetAccount, revokeAccount } from '../../../lib/accounts.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { formatDate, formatRelative } from '../../../lib/format.js';
import { PositionChip, PositionEditor, type PositionDraft } from './PositionEditor.js';

export default function PersonDetail(): JSX.Element {
  const { id = '' } = useParams();
  const labels = useLabels();
  const can = useCan();

  const person = usePerson(id);
  const units = useUnits();
  const roles = useRoles();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);

  const [assigning, setAssigning] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ edgeId: string; label: string } | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [invite, setInvite] = useState<AccountInvite | null>(null);
  const [revoking, setRevoking] = useState(false);

  const message = (caught: unknown, fallback: string): string =>
    caught instanceof ApiError ? caught.message : fallback;

  // A 404 here is out-of-scope OR nonexistent, deliberately indistinguishable (13 §5). The
  // copy has to be true for both, so it says neither.
  if (person.error instanceof ApiError && person.error.status === 404) {
    return (
      <>
        <PageHeader title="Not found" />
        <EmptyState
          icon="person"
          title="No such person here"
          body="Either nobody with that link exists, or they sit somewhere you cannot see. Both look the same from here, on purpose."
          action={<Link className="btn btn-secondary" to="/app/people">Back to People</Link>}
        />
      </>
    );
  }

  const data = person.data;
  const positions = data?.positions ?? [];

  const addPosition = (draft: PositionDraft): void => {
    setAssignBusy(true);
    setAssignError(null);
    const body: CreateAssignmentBody = {
      roleId: draft.roleId, unitId: draft.unitId, isPrimary: draft.isPrimary,
    };
    void person
      .assign(body)
      .then(() => setAssigning(false))
      .catch((caught: unknown) => {
        // Usually INV-012's `WOULD_ESCALATE`, and its message names the capability that
        // would have been handed out. Verbatim and inline: the server's sentence is the
        // actionable one, and a generic replacement throws away the only useful part.
        setAssignError(message(caught, 'That position could not be added.'));
      })
      .finally(() => setAssignBusy(false));
  };

  const provision = (mode: 'create' | 'reset'): void => {
    setAccountBusy(true);
    setAccountError(null);
    const call = mode === 'create' ? inviteAccount : resetAccount;
    void call(id)
      .then((result) => setInvite(result))
      .catch((caught: unknown) => {
        // Usually INV-012's `WOULD_ESCALATE` — named and verbatim, same reasoning as the
        // position editor's error above (34 § States).
        setAccountError(message(caught, 'That link could not be created.'));
      })
      .finally(() => setAccountBusy(false));
  };

  const revoke = (): void => {
    setRevoking(false);
    setAccountBusy(true);
    setAccountError(null);
    void revokeAccount(id)
      .then(() => person.reload())
      .catch((caught: unknown) => {
        // The lockout guard's 409 ("Sign out instead.") lands here too, and it is the
        // caller's own sentence — 57 § Revocation.
        setAccountError(message(caught, 'That account could not be revoked.'));
      })
      .finally(() => setAccountBusy(false));
  };

  return (
    <>
      <PageHeader
        title={data?.name ?? 'Person'}
        subtitle={data?.email ?? undefined}
        action={
          <Link className="btn btn-secondary btn-back" to="/app/people">
            {/* "people" is a structural product word and never resolves through
                useLabels() (22 §1) — the org renames its units, not its humans. */}
            <Icon name="back" size={16} /> All people
          </Link>
        }
      />

      {person.error && !(person.error instanceof ApiError && person.error.status === 404) && (
        <p className="form-error" role="alert">
          {message(person.error, 'Could not load this person.')}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void person.reload()}>
            Try again
          </button>
        </p>
      )}

      {person.loading && !data ? (
        <div className="card" aria-hidden="true">
          <div className="tree-skeleton">
            {[0, 1, 2, 3].map((row) => <span key={row} className="skeleton-row wide" />)}
          </div>
        </div>
      ) : (
        <div className="settings-page">
          <section className="settings-card" aria-labelledby="person-identity">
            <h3 className="utility" id="person-identity">Identity</h3>
            <div className="card">
              <div className="field">
                <label htmlFor="person-name">Name</label>
                {can('person.update') ? (
                  <InlineName
                    value={data?.name ?? ''}
                    ariaLabel="Name"
                    onCommit={(name) => {
                      setError(null);
                      void person.rename(name).catch((caught: unknown) => {
                        setError(message(caught, 'That name could not be saved.'));
                      });
                    }}
                  />
                ) : (
                  <p className="person-name-text">{data?.name}</p>
                )}
              </div>

              <div className="field">
                <label htmlFor="person-email">Email</label>
                {/* THE ONE PLACE AN ADDRESS CAN CHANGE. `/app/profile` refuses it on purpose
                    — a self-service email change is an account-takeover path — so it happens
                    here, behind `person.update`, with an audit row naming who did it (47). */}
                {can('person.update') && editingEmail ? (
                  <InlineName
                    value={data?.email ?? ''}
                    ariaLabel="Email"
                    autoFocus
                    onCancel={() => setEditingEmail(false)}
                    onCommit={(email) => {
                      setError(null);
                      setEditingEmail(false);
                      void person.setEmail(email).catch((caught: unknown) => {
                        setError(message(caught, 'That address could not be saved.'));
                      });
                    }}
                  />
                ) : (
                  <p className="person-email-row">
                    <span>{data?.email ?? <span className="text-meta">No address</span>}</span>
                    {can('person.update') && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-tiny"
                        onClick={() => setEditingEmail(true)}
                      >
                        <Icon name="edit" size={16} /> Change
                      </button>
                    )}
                  </p>
                )}
                <p className="field-help">
                  Changing this changes where a sign-in link lands. It is recorded against
                  your name.
                </p>
              </div>

              {data?.createdAt && (
                <p className="field-help">Added {formatDate(data.createdAt)}.</p>
              )}
              {error && <p className="field-error" role="alert">{error}</p>}
            </div>
          </section>

          {/* 57. Two separate actions on two separate audit rows — positions are the
              powers, the account is the key, and the panel never merges them into one
              button (57 § Purpose). */}
          <section className="settings-card" aria-labelledby="person-account">
            <h3 className="utility" id="person-account">Account</h3>
            <div className="card">
              <AccountPanel
                account={data?.account}
                busy={accountBusy}
                canCreate={can('account.create')}
                canReset={can('account.reset')}
                canRevoke={can('account.revoke')}
                onInvite={() => provision('create')}
                onReissue={() => provision('reset')}
                onRevoke={() => setRevoking(true)}
              />
              {accountError && <p className="field-error" role="alert">{accountError}</p>}
            </div>
          </section>

          <section className="settings-card" aria-labelledby="person-positions">
            <h3 className="utility" id="person-positions">Positions</h3>
            <div className="card">
              {positions.length === 0 && !assigning && (
                // Not an empty area. Somebody with no position can do nothing at all, and
                // that is the single most likely reason anyone is on this page (34).
                <p className="text-muted">
                  No position — they cannot sign in to anything yet. A position is a role at
                  a {labels.unit.one.toLowerCase()}, and it is what grants every power below.
                </p>
              )}

              <div className="person-positions">
                {positions.map((position) => (
                  <PositionChip
                    key={position.edgeId}
                    roleName={position.roleName}
                    roleLevel={position.roleLevel}
                    unitName={position.unitName}
                    isPrimary={position.isPrimary}
                    validTo={position.validTo}
                    onRemove={
                      can('assignment.delete')
                        ? () =>
                            setPending({
                              edgeId: position.edgeId,
                              label: `${position.roleName} — ${position.unitName}`,
                            })
                        : undefined
                    }
                  />
                ))}
              </div>

              {assigning ? (
                <PositionEditor
                  roles={roles.data ?? []}
                  units={unitOptions}
                  labels={labels}
                  busy={assignBusy}
                  error={assignError}
                  hasPositions={positions.length > 0}
                  onAdd={addPosition}
                  onCancel={() => { setAssigning(false); setAssignError(null); }}
                />
              ) : (
                can('assignment.create') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-tiny"
                    onClick={() => { setAssignError(null); setAssigning(true); }}
                  >
                    <Icon name="add" size={16} /> Position
                  </button>
                )
              )}

              {assignError && !assigning && (
                <p className="field-error" role="alert">{assignError}</p>
              )}
            </div>
          </section>

          <section className="settings-card" aria-labelledby="person-powers">
            <h3 className="utility" id="person-powers">What they can do, and where</h3>
            <div className="card">
              <PowersByPlace
                places={data?.powersByPlace ?? []}
                emptyHint={
                  positions.length === 0
                    ? 'Nothing anywhere, because they hold no position.'
                    : 'Anywhere else: nothing. Powers stop at the place the position sits.'
                }
              />
            </div>
          </section>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`Remove ${pending.label}?`}
          // `<ConfirmDialog>` requires a consequence (24 §6), and the honest one is about
          // POWERS rather than about a chip disappearing: the powers below this position
          // go with it, and they are listed on this very page.
          consequence={`Everything ${data?.name ?? 'they'} could do at ${pending.label.split(' — ')[1] ?? 'that place'} goes with it. They keep their account and any other positions.`}
          verb="Remove"
          destructive
          onConfirm={() => {
            const target = pending;
            setPending(null);
            void person.unassign(target.edgeId).catch((caught: unknown) => {
              setError(message(caught, 'That position could not be removed.'));
            });
          }}
          onCancel={() => setPending(null)}
        />
      )}

      {revoking && (
        <ConfirmDialog
          title={`Revoke ${data?.name ?? 'their'} sign-in?`}
          consequence="They can no longer sign in, and any live session ends on their next request. Their positions, past activity and audit rows stay exactly as they are — this is not the same as removing them."
          verb="Revoke"
          destructive
          onConfirm={revoke}
          onCancel={() => setRevoking(false)}
        />
      )}

      {invite && (
        <InviteLink
          url={invite.url}
          expiresAt={invite.expiresAt}
          label={invite.personName}
          onClose={() => {
            setInvite(null);
            void person.reload();
          }}
        />
      )}
    </>
  );
}

/** 57 § States, in the order the doc tests them (`features/accounts/status.ts`). */
function AccountPanel({
  account,
  busy,
  canCreate,
  canReset,
  canRevoke,
  onInvite,
  onReissue,
  onRevoke,
}: {
  account: AccountStatus | undefined;
  busy: boolean;
  canCreate: boolean;
  canReset: boolean;
  canRevoke: boolean;
  onInvite: () => void;
  onReissue: () => void;
  onRevoke: () => void;
}): JSX.Element {
  if (!account || account.state === 'none') {
    return canCreate ? (
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onInvite}>
        {busy ? 'Inviting…' : 'Invite'}
      </button>
    ) : (
      <p className="text-muted">No account. They cannot sign in.</p>
    );
  }

  if (account.state === 'invited') {
    return (
      <div className="account-panel-row">
        <p>
          <span className="tag tag-neutral">Pending</span> — expires{' '}
          {formatRelative(account.expiresAt)}
        </p>
        <div className="account-panel-actions">
          {canReset && (
            <button type="button" className="btn btn-secondary btn-tiny" disabled={busy} onClick={onReissue}>
              Re-issue
            </button>
          )}
          {canRevoke && (
            <button type="button" className="btn btn-ghost btn-tiny" disabled={busy} onClick={onRevoke}>
              Revoke
            </button>
          )}
        </div>
      </div>
    );
  }

  if (account.state === 'active') {
    return (
      <div className="account-panel-row">
        <p>
          <span className="tag tag-good">Active</span> —{' '}
          {account.lastLoginAt ? `last signed in ${formatRelative(account.lastLoginAt)}` : 'has not signed in yet'}
        </p>
        <div className="account-panel-actions">
          {canRevoke && (
            <button type="button" className="btn btn-ghost btn-tiny" disabled={busy} onClick={onRevoke}>
              Revoke
            </button>
          )}
        </div>
      </div>
    );
  }

  // 'disabled'
  return (
    <div className="account-panel-row">
      <p>
        <span className="tag tag-muted">Disabled</span>
        {account.disabledAt ? ` — ${formatDate(account.disabledAt)}` : ''}
      </p>
      <div className="account-panel-actions">
        {canReset && (
          <button type="button" className="btn btn-secondary btn-tiny" disabled={busy} onClick={onReissue}>
            Re-issue
          </button>
        )}
      </div>
    </div>
  );
}
