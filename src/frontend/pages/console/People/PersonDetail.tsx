// One person. What is open and in flight on the page is `state.people.pages[id]`
// (store/screens/people.ts); every command is a thunk there, and re-reads the person through
// its tag, because their powers are worked out on the server. docs/REDUX-PLAN.md §6.10.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AccountStatus } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { InviteLink } from '../../../components/feedback/InviteLink.js';
import { InlineName } from '../../../components/org/InlineName.js';
import { PowersByPlace } from '../../../components/org/PowersByPlace.js';
import { Involvement } from '../../../components/org/Involvement.js';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { usePerson, useRoles } from '../../../lib/people.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  FAILED,
  accountLinkMade,
  accountRevoked,
  emailEditClosed,
  emailEditOpened,
  pageInviteClosed,
  pagePositionClosed,
  pagePositionOpened,
  personEmailChanged,
  personPageLeft,
  personRenamed,
  positionAdded,
  positionRemoved,
  revokeAsked,
  revokeDismissed,
  selectPersonPage,
  unassignAsked,
  unassignDismissed,
} from '../../../store/screens/people.js';
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

  const dispatch = useAppDispatch();
  const page = useAppSelector((state) => selectPersonPage(state, id));
  useClearOnLeave(personPageLeft({ personId: id }));
  const { assigning, assignBusy, editingEmail, accountBusy, invite } = page;
  const assignError = messageOf(page.assignError, FAILED.assign);
  const error = page.failure ? messageOf(page.failure.error, FAILED[page.failure.during]) : null;
  const accountError = page.accountFailure
    ? messageOf(page.accountFailure.error, FAILED[page.accountFailure.during])
    : null;
  const pending = page.unassigning;
  const revoking = page.confirmingRevoke;

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
    void dispatch(
      positionAdded({
        personId: id,
        body: { roleId: draft.roleId, unitId: draft.unitId, isPrimary: draft.isPrimary },
        from: 'page',
      }),
    );
  };

  const provision = (mode: 'create' | 'reset'): void => {
    void dispatch(accountLinkMade({ personId: id, mode: mode === 'create' ? 'invite' : 'reset', from: 'page' }));
  };

  const revoke = (): void => {
    void dispatch(accountRevoked({ personId: id }));
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
          {person.error instanceof ApiError ? person.error.message : 'Could not load this person.'}{' '}
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
                    onCommit={(name) => void dispatch(personRenamed({ personId: id, name, from: 'page' }))}
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
                    onCancel={() => dispatch(emailEditClosed({ personId: id }))}
                    onCommit={(email) => void dispatch(personEmailChanged({ personId: id, email }))}
                  />
                ) : (
                  <p className="person-email-row">
                    <span>{data?.email ?? <span className="text-meta">No address</span>}</span>
                    {can('person.update') && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-tiny"
                        onClick={() => dispatch(emailEditOpened({ personId: id }))}
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
                onRevoke={() => dispatch(revokeAsked({ personId: id }))}
              />
              {accountError && <p className="field-error" role="alert">{accountError}</p>}
            </div>
          </section>

          <section className="settings-card" aria-labelledby="person-positions">
            <h3 className="utility" id="person-positions">Positions</h3>
            <div className="card">
              {positions.length === 0 && !assigning && (
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
                            dispatch(unassignAsked({
                              personId: id,
                              edgeId: position.edgeId,
                              label: `${position.roleName} — ${position.unitName}`,
                            }))
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
                  onCancel={() => dispatch(pagePositionClosed({ personId: id }))}
                />
              ) : (
                can('assignment.create') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-tiny"
                    onClick={() => dispatch(pagePositionOpened({ personId: id }))}
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

          {/* FOURTH, AND FOR MOST OF AN ORGANISATION IT IS THE ONLY ONE WITH AN ANSWER.
              The three blocks above are all about POWER, and a respondent holds none — no
              account, no grants (DEC-009) — so a student's page used to end here, empty,
              while five polls addressed to their role were open one screen away (N-079).

              Absent rather than empty when the caller holds no `campaign.read` anywhere:
              the server returns [] in that case and cannot tell it from "nothing open", so
              the section only renders when there is something to say. That is 46's rule —
              a section the caller cannot read is absent, not greyed. */}
          {(data?.involvement?.length ?? 0) > 0 && (
            <section className="settings-card" aria-labelledby="person-involvement">
              <h3 className="utility" id="person-involvement">
                {labels.campaign.many} they are part of
              </h3>
              <div className="card">
                <Involvement
                  items={data?.involvement ?? []}
                  who="them"
                  emptyHint=""
                  canOpenCampaign={can('campaign.read')}
                />
              </div>
            </section>
          )}

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
          consequence={`Everything ${data?.name ?? 'they'} could do at ${pending.label.split(' — ')[1] ?? 'that place'} goes with it. They keep their account and any other positions.`}
          verb="Remove"
          destructive
          onConfirm={() => void dispatch(positionRemoved({ personId: id, edgeId: pending.edgeId, from: 'page' }))}
          onCancel={() => dispatch(unassignDismissed({ personId: id }))}
        />
      )}

      {revoking && (
        <ConfirmDialog
          title={`Revoke ${data?.name ?? 'their'} sign-in?`}
          consequence="They can no longer sign in, and any live session ends on their next request. Their positions, past activity and audit rows stay exactly as they are — this is not the same as removing them."
          verb="Revoke"
          destructive
          onConfirm={revoke}
          onCancel={() => dispatch(revokeDismissed({ personId: id }))}
        />
      )}

      {invite && (
        <InviteLink
          url={invite.url}
          expiresAt={invite.expiresAt}
          label={invite.personName}
          onClose={() => dispatch(pageInviteClosed({ personId: id }))}
        />
      )}
    </>
  );
}

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
