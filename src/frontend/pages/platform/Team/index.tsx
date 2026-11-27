// `/ops/team`: the operator accounts, for an owner (`platform.operator.manage`). R-716.
//
// The accounts are RTK Query's cache (`getOperators`); the page's state (the add form, the
// one-time authenticator code, the change waiting on its confirmation) is `state.opsTeam`
// (store/screens/opsTeam.ts); which buttons a row may offer, and why not, is
// `selectTeamView`, which mirrors the server's two rules (nobody changes their own account;
// the platform keeps two owners).
//
// THE NEW OPERATOR'S PASSWORD NEVER ENTERS THE STORE (DEC-014): its box is uncontrolled, the
// store keeps only whether it is long enough, and `operatorAdded` receives it as an argument.
import { useEffect, useRef, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Icon } from '../../../components/Icon.js';
import { Denied, Empty, Kpi, OpsError, OpsHeader, Pill, initialsOf } from '../../../components/platform/OpsUi.js';
import { formatRelative } from '../../../lib/format.js';
import { useOperators } from '../../../lib/opsRegisters.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { useClearOnLeave } from '../../../store/screens/common.js';
import { opsMessageOf } from '../../../store/screens/operator.js';
import {
  OPERATOR_PASSWORD_MIN,
  addOperatorClosed,
  addOperatorEdited,
  addOperatorOpened,
  addOperatorPasswordTyped,
  createdAcknowledged,
  operatorAdded,
  operatorChangeAsked,
  operatorChangeDismissed,
  operatorChanged,
  selectTeam,
  selectTeamView,
  teamLeft,
  type OperatorChange,
} from '../../../store/screens/opsTeam.js';

/** The authenticator link as a code to scan, drawn onto a canvas (a DOM resource). */
function SecretCode({ url }: { url: string }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  // Effect (DOM): draw the code onto its canvas.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, url, { width: 180, margin: 1 }).catch(() => undefined);
  }, [url]);
  return <canvas ref={ref} width={180} height={180} role="img" aria-label="Authenticator code to scan" />;
}

const describe = (change: OperatorChange): string =>
  change.status === 'disabled'
    ? 'disable this account. They are signed out of nothing they are in, but cannot sign in again until re-enabled'
    : change.status === 'active'
      ? 'enable this account again'
      : change.role === 'owner'
        ? 'make them an owner: revenue, analytics, the Enterprise queue, suspension and this page'
        : 'make them staff: the estate and support, without revenue, suspension or this page';

export default function Team(): JSX.Element {
  const dispatch = useAppDispatch();
  const accounts = useOperators();
  const view = useAppSelector(selectTeamView);
  const { add, created, pending, busyId, error } = useAppSelector(selectTeam);
  useClearOnLeave(teamLeft());

  if (accounts.forbidden) {
    return <Denied capability="platform.operator.manage" what="Managing the team" />;
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    void dispatch(operatorAdded({ password: typeof password === 'string' ? password : '' }));
  };

  const addError = opsMessageOf(add.error, 'Could not add the operator.');
  const changeError = opsMessageOf(error, 'Could not change the operator.');
  const canSubmit = !add.busy && add.email.trim() !== '' && add.name.trim() !== '' && add.passwordLongEnough;

  return (
    <>
      <OpsHeader
        kicker="Platform"
        title="Team"
        subtitle="The people who can open this console. Owners see money and can suspend; staff help one customer at a time."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => dispatch(addOperatorOpened())}>
            <Icon name="add" size={16} />
            Add operator
          </button>
        }
      />

      <section className="ops-kpis" aria-label="The team in numbers">
        <Kpi icon="operator" label="Owners" value={view.counts.owners} detail="Active, with every capability" />
        <Kpi icon="team" label="Staff" value={view.counts.staff} detail="Active, support capabilities" />
        <Kpi icon="close" label="Disabled" value={view.counts.disabled} detail="Cannot sign in" />
      </section>

      {created && (
        <section className="ops-card card" aria-labelledby="created">
          <div className="ops-card-head">
            <h2 id="created">{created.name} can sign in once they scan this</h2>
          </div>
          <div className="ops-secret">
            <SecretCode url={created.otpauthUrl} />
            <div className="ops-stack">
              <p className="text-meta">
                Give this to {created.email} now: it is their second factor, and it is shown <strong>once</strong>.
                The server cannot show it again. They scan it with an authenticator app and sign in with
                the password you set and the six-digit code.
              </p>
              <code>{created.otpauthUrl}</code>
              <div className="ops-actions">
                <button type="button" className="btn btn-primary" onClick={() => dispatch(createdAcknowledged())}>
                  Done, they have it
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {changeError && <OpsError>{changeError}</OpsError>}
      {accounts.error && <OpsError>{accounts.error.message}</OpsError>}

      <section className="ops-card card" aria-labelledby="operators">
        <div className="ops-card-head">
          <h2 id="operators">Operators</h2>
        </div>
        <div className={`ops-table-wrap${accounts.loading ? ' ops-loading' : ''}`}>
          {view.rows.length === 0 && !accounts.loading ? (
            <Empty title="No operators." />
          ) : (
            <table className="ops-table">
              <caption className="sr-only">Operators</caption>
              <thead>
                <tr>
                  <th scope="col">Operator</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last signed in</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => {
                  const busy = busyId === row.id;
                  const nextRole = row.role === 'owner' ? 'staff' : 'owner';
                  const nextStatus = row.status === 'active' ? 'disabled' : 'active';
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="ops-person">
                          <span className="ops-avatar" aria-hidden="true">{initialsOf(row.name)}</span>
                          <span>
                            <strong>{row.name}{row.isYou ? ' (you)' : ''}</strong>
                            <span>{row.email}</span>
                          </span>
                        </div>
                      </td>
                      <td><Pill tone={row.role === 'owner' ? 'accent' : undefined}>{row.role === 'owner' ? 'Owner' : 'Staff'}</Pill></td>
                      <td><Pill tone={row.status === 'active' ? 'good' : 'bad'}>{row.status === 'active' ? 'Active' : 'Disabled'}</Pill></td>
                      <td className="is-muted">{row.lastLoginAt ? formatRelative(row.lastLoginAt) : 'Never'}</td>
                      <td>
                        {row.locked ? (
                          <span className="ops-how">{row.locked}</span>
                        ) : (
                          <span className="ops-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => dispatch(operatorChangeAsked({ id: row.id, name: row.name, change: { role: nextRole } }))}
                            >
                              Make {nextRole}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm ${nextStatus === 'disabled' ? 'btn-danger' : 'btn-secondary'}`}
                              disabled={busy}
                              onClick={() => dispatch(operatorChangeAsked({ id: row.id, name: row.name, change: { status: nextStatus } }))}
                            >
                              {nextStatus === 'disabled' ? 'Disable' : 'Enable'}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {pending && (
        <ConfirmDialog
          title={`Change ${pending.name}?`}
          consequence={`This will ${describe(pending.change)}. It is written to the audit trail.`}
          verb={pending.change.status === 'disabled' ? 'Disable' : pending.change.status === 'active' ? 'Enable' : `Make ${pending.change.role ?? ''}`}
          confirmDisabled={busyId !== null}
          onConfirm={() => void dispatch(operatorChanged())}
          onCancel={() => dispatch(operatorChangeDismissed())}
        />
      )}

      {add.open && (
        <div className="dialog-backdrop" onMouseDown={() => dispatch(addOperatorClosed())}>
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={submit}
            onChange={(event) => {
              const target = event.target as HTMLInputElement;
              if (target.name === 'password') {
                dispatch(addOperatorPasswordTyped({ longEnough: target.value.length >= OPERATOR_PASSWORD_MIN }));
              }
            }}
          >
            <h2 className="dialog-title" id="add-title">Add an operator</h2>
            <p className="dialog-body">
              They get a password from you now and an authenticator code on the next screen. Every
              sign-in needs both.
            </p>
            {addError && <p className="field-error" role="alert">{addError}</p>}
            <label className="ops-field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={add.name}
                onChange={(event) => dispatch(addOperatorEdited({ name: event.target.value }))}
                maxLength={120}
                autoFocus
                required
              />
            </label>
            <label className="ops-field">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={add.email}
                onChange={(event) => dispatch(addOperatorEdited({ email: event.target.value }))}
                maxLength={254}
                required
              />
            </label>
            <div className="ops-field">
              <label className="field-label" htmlFor="new-operator-password">Password</label>
              <input
                id="new-operator-password"
                className="input"
                type="password"
                name="password"
                autoComplete="new-password"
                aria-describedby="new-operator-password-hint"
                required
              />
              <span className="field-hint" id="new-operator-password-hint">
                At least {OPERATOR_PASSWORD_MIN} characters.
              </span>
            </div>
            <fieldset className="ops-field ops-fieldset">
              <legend className="field-label">Role</legend>
              <div className="ops-segmented">
                {(['staff', 'owner'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={add.role === role}
                    onClick={() => dispatch(addOperatorEdited({ role }))}
                  >
                    {role === 'owner' ? 'Owner' : 'Staff'}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(addOperatorClosed())}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
                {add.busy ? 'Adding…' : 'Add operator'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
