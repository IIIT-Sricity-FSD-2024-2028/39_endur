// T-050 — /app/people. 34, design_specs/design/04 §4.4.
//
// **This is the screen that made a cold start possible.** The API has had nine people
// endpoints and CSV import since T-018; the console had two read-only hooks. So an
// organisation created from `/start` could build a structure, add subjects and launch a
// campaign — and could not add a second human being. Everything below is in service of
// that one gap.
//
// The multi-position model is the thing to look at: a person is a name and an email plus
// one or more `Role — Unit` pairs, which is what makes a dean who is also a professor
// representable without a special case. The unit half of every chip is load-bearing
// (INV-005) and is never abbreviated away.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AccountInvite, CreateAssignmentBody, PersonSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { InviteLink } from '../../../components/feedback/InviteLink.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { InlineName } from '../../../components/org/InlineName.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { usePeopleList, useRoles } from '../../../lib/people.js';
import { inviteAccount } from '../../../lib/accounts.js';
import { formatRelative, pluralise } from '../../../lib/format.js';
import { PersonForm, type PersonDraft } from './PersonForm.js';
import { PositionChip, PositionEditor, type PositionDraft } from './PositionEditor.js';
import { ImportWizard } from './ImportWizard.js';

export default function People(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const unitId = params.get('unit') ?? '';
  const roleId = params.get('role') ?? '';
  const cursor = params.get('cursor') ?? undefined;

  const list = usePeopleList({ q, unitId, roleId, cursor });
  const units = useUnits();
  const roles = useRoles();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);

  const [term, setTerm] = useState(q);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<PersonSummary | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  /** Which row has its two dropdowns open. One at a time — never a modal (34). */
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  /** The one-time credential from `POST /people/:id/account`. Shown once, in `<InviteLink>`. */
  const [invite, setInvite] = useState<{ person: PersonSummary; data: AccountInvite } | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const filtered = Boolean(q || unitId || roleId);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;

  /** Any filter change starts paging again — a cursor from the old query means nothing. */
  const setFilter = (patch: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('cursor');
    setParams(next);
  };

  const message = (error: unknown, fallback: string): string =>
    error instanceof ApiError ? error.message : fallback;

  const invitePerson = (person: PersonSummary): void => {
    setInvitingId(person.id);
    setRowError(null);
    void inviteAccount(person.id)
      .then((data) => setInvite({ person, data }))
      .catch((error: unknown) => {
        setRowError({ id: person.id, text: message(error, 'That link could not be created.') });
      })
      .finally(() => setInvitingId(null));
  };

  const submit = (draft: PersonDraft): void => {
    setSaving(true);
    setFormError(null);
    void list
      .create(draft)
      // Straight into the position editor for the person just added. Creating somebody
      // grants them nothing, so leaving the administrator on a list with a new row that
      // can do nothing is leaving the job half done (34 § Interactions).
      .then((person) => {
        setCreating(false);
        if (can('assignment.create')) setAssigning(person.id);
      })
      .catch((error: unknown) => setFormError(message(error, 'That person could not be added.')))
      .finally(() => setSaving(false));
  };

  const addPosition = (person: PersonSummary, draft: PositionDraft): void => {
    setAssignBusy(true);
    setRowError(null);
    const body: CreateAssignmentBody = {
      roleId: draft.roleId,
      unitId: draft.unitId,
      isPrimary: draft.isPrimary,
    };
    void list
      .assign(person.id, body)
      .then(() => setAssigning(null))
      .catch((error: unknown) => {
        // Usually INV-012's `WOULD_ESCALATE`, and its message names the capability that
        // would have been handed out. Kept inline and kept verbatim: the server's sentence
        // is the actionable one, and a generic replacement would throw away the only part
        // that tells the administrator what to do (34 § States).
        setRowError({ id: person.id, text: message(error, 'That position could not be added.') });
      })
      .finally(() => setAssignBusy(false));
  };

  const columns: Column<PersonSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      render: (row) => (
        <span className="person-name">
          {can('person.update') ? (
            <InlineName
              value={row.name}
              ariaLabel="Name"
              onCommit={(name) => {
                setRowError(null);
                void list.update(row.id, { name }).catch((error: unknown) => {
                  setRowError({ id: row.id, text: message(error, 'That name could not be saved.') });
                });
              }}
            />
          ) : (
            <span className="person-name-text">{row.name}</span>
          )}
          {/* T-051. The name itself stays an inline rename — it is the fast path an
              administrator uses most — so the link to the detail page is its own affordance
              rather than wrapped around it. A name that both renames and navigates does
              neither predictably. */}
          <Link className="person-open" to={`/app/people/${row.id}`} aria-label={`Open ${row.name}`}>
            <Icon name="disclosure" size={16} />
          </Link>
        </span>
      ),
    },
    {
      key: 'positions',
      header: 'Positions',
      render: (row) => (
        <div className="person-positions">
          {row.positions.length === 0 && assigning !== row.id && (
            // Not an empty cell. Somebody with no position can do nothing at all, and that
            // is the single most likely reason an administrator is on this screen.
            <span className="text-meta">No position — cannot sign in to anything</span>
          )}
          {row.positions.map((position) => (
            <PositionChip
              key={position.edgeId}
              roleName={position.roleName}
              unitName={position.unitName}
              isPrimary={position.isPrimary}
              onRemove={
                can('assignment.delete')
                  ? () => {
                      setRowError(null);
                      void list.unassign(row.id, position.edgeId).catch((error: unknown) => {
                        setRowError({
                          id: row.id,
                          text: message(error, 'That position could not be removed.'),
                        });
                      });
                    }
                  : undefined
              }
            />
          ))}

          {assigning === row.id ? (
            <PositionEditor
              roles={roles.data ?? []}
              units={unitOptions}
              labels={labels}
              busy={assignBusy}
              error={rowError?.id === row.id ? rowError.text : null}
              hasPositions={row.positions.length > 0}
              onAdd={(draft) => addPosition(row, draft)}
              onCancel={() => {
                setAssigning(null);
                setRowError(null);
              }}
            />
          ) : (
            can('assignment.create') && (
              <button
                type="button"
                className="btn btn-ghost btn-tiny"
                onClick={() => {
                  setRowError(null);
                  setAssigning(row.id);
                }}
              >
                <Icon name="add" size={16} /> Position
              </button>
            )
          )}

          {rowError?.id === row.id && assigning !== row.id && (
            <span className="field-error" role="alert">{rowError.text}</span>
          )}
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      hideBelow: 'md',
      render: (row) => row.email ?? <span className="text-meta">—</span>,
    },
    {
      key: 'account',
      header: 'Account',
      // 34 § States, 57 § States. The list only ever offers `Invite` — re-issue and revoke
      // live on the detail page, where there is room to say what they do (34 § Interactions).
      render: (row) => {
        if (row.account.state === 'active') return <span className="tag tag-good">Active</span>;
        if (row.account.state === 'invited') {
          return (
            <span className="tag tag-neutral">
              Pending — expires {formatRelative(row.account.expiresAt)}
            </span>
          );
        }
        if (row.account.state === 'disabled') return <span className="tag tag-muted">Disabled</span>;
        return can('account.create') ? (
          <button
            type="button"
            className="btn btn-ghost btn-tiny"
            disabled={invitingId === row.id}
            onClick={() => invitePerson(row)}
          >
            {invitingId === row.id ? 'Inviting…' : 'Invite'}
          </button>
        ) : (
          <span className="text-meta">No account</span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) =>
        can('person.delete') ? (
          <button type="button" className="btn btn-ghost" onClick={() => setPending(row)}>
            Remove
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="People"
        subtitle={total > 0 ? pluralise(total, 'person', 'people') : undefined}
        filters={[
          ...(q ? [{ label: `Search: ${q}`, onClear: () => { setTerm(''); setFilter({ q: null }); } }] : []),
          ...(unitId
            ? [{
                label: `${labels.unit.one}: ${unitOptions.find((u) => u.id === unitId)?.label.trim() ?? ''}`,
                onClear: () => setFilter({ unit: null }),
              }]
            : []),
          ...(roleId
            ? [{
                label: `Role: ${roles.data?.find((r) => r.id === roleId)?.name ?? ''}`,
                onClear: () => setFilter({ role: null }),
              }]
            : []),
        ]}
        action={
          // Hidden while the empty state shows its own copy — two identical primary actions
          // on one screen is the reader wondering which is the real one.
          can('person.create') && !(rows.length === 0 && !filtered) ? (
            <>
              {can('person.import') && (
                <button type="button" className="btn btn-secondary" onClick={() => setImporting(true)}>
                  Import
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                <Icon name="add" size={18} /> Add a person
              </button>
            </>
          ) : undefined
        }
      />

      <div className="card list-controls list-toolbar">
        <form
          className="list-search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ q: term.trim() || null });
          }}
        >
          <label className="sr-only" htmlFor="person-search">Search people</label>
          <input
            id="person-search"
            className="input"
            value={term}
            placeholder="Search by name or email"
            onChange={(event) => setTerm(event.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>

        <label className="list-filter">
          <span className="sr-only">Filter by {labels.unit.one}</span>
          <select
            className="input"
            value={unitId}
            onChange={(event) => setFilter({ unit: event.target.value || null })}
          >
            <option value="">All {labels.unit.many.toLowerCase()}</option>
            {unitOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="list-filter">
          <span className="sr-only">Filter by role</span>
          <select
            className="input"
            value={roleId}
            onChange={(event) => setFilter({ role: event.target.value || null })}
          >
            <option value="">All roles</option>
            {(roles.data ?? []).map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </label>
      </div>

      {list.error && (
        <p className="form-error" role="alert">
          {message(list.error, 'Could not load people.')}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void list.reload()}>
            Try again
          </button>
        </p>
      )}

      {list.loading && !list.data ? (
        <div className="card" aria-hidden="true">
          <div className="tree-skeleton">
            {[0, 1, 2, 3, 4].map((row) => (
              <span key={row} className="skeleton-row wide" />
            ))}
          </div>
        </div>
      ) : (
        <div className="card table-panel">
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          caption="People"
          empty={
            // The two empties differ, and the difference is the whole point: one is an
            // organisation with nobody in it, the other is a query with nothing in it (34).
            filtered ? (
              <EmptyState
                icon="people"
                title="No one matches those filters"
                body="Nothing here matches what you asked for. Clearing the filters brings the rest back."
                action={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setTerm(''); setFilter({ q: null, unit: null, role: null }); }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon="people"
                title="Nobody here yet"
                body={`Add the people in your organization and give each a role at a ${labels.unit.one.toLowerCase()}. What somebody can do comes from where they sit, not from who they are.`}
                action={
                  can('person.create') ? (
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                      Add a person
                    </button>
                  ) : undefined
                }
              />
            )
          }
        />
        </div>
      )}

      {(cursor || list.data?.page.hasMore) && (
        <div className="pager">
          {cursor && (
            <button type="button" className="btn btn-secondary" onClick={() => setFilter({ cursor: null })}>
              Back to the start
            </button>
          )}
          {list.data?.page.hasMore && list.data.page.nextCursor && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('cursor', list.data?.page.nextCursor ?? '');
                setParams(next);
              }}
            >
              Next
            </button>
          )}
        </div>
      )}

      {creating && (
        <PersonForm
          saving={saving}
          error={formError}
          onSubmit={submit}
          onCancel={() => { setCreating(false); setFormError(null); }}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={`Remove ${pending.name}?`}
          consequence={removeConsequence(pending)}
          verb="Remove"
          destructive
          onConfirm={() => {
            const person = pending;
            setPending(null);
            void list.remove(person.id).catch((error: unknown) => {
              setRowError({ id: person.id, text: message(error, 'That person could not be removed.') });
            });
          }}
          onCancel={() => setPending(null)}
        />
      )}

      {invite && (
        <InviteLink
          url={invite.data.url}
          expiresAt={invite.data.expiresAt}
          label={invite.data.personName}
          onClose={() => {
            setInvite(null);
            void list.reload();
          }}
        />
      )}

      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            void list.reload();
          }}
        />
      )}
    </>
  );
}

/**
 * `<ConfirmDialog>` requires a `consequence` (24 §6), and the honest one here depends on
 * what the person actually holds: removing somebody with three positions takes three
 * permission grants with them, and that is worth saying before it happens rather than
 * after.
 */
function removeConsequence(person: PersonSummary): string {
  const held = person.positions.length;
  if (held === 0) {
    return 'They hold no positions, so nothing else changes. Their past activity stays in the record.';
  }
  return `This also removes ${pluralise(held, 'position', 'positions')}, and everything those allowed them to do. Their past activity stays in the record.`;
}
