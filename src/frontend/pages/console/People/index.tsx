// The directory. The filters are the URL; everything the reader is doing here is
// `state.people.list` (store/screens/people.ts), and every command a thunk there.
// docs/REDUX-PLAN.md §6.10.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PersonSummary } from '@endur/shared';
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
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  FAILED,
  accountLinkMade,
  addPersonClosed,
  addPersonOpened,
  importClosed,
  importOpened,
  inviteLinkClosed,
  peopleListLeft,
  peopleSearchTyped,
  personAdded,
  personRemoved,
  personRenamed,
  positionAdded,
  positionRemoved,
  removePersonAsked,
  removePersonDismissed,
  rowPositionClosed,
  rowPositionOpened,
  selectPeopleList,
} from '../../../store/screens/people.js';import { formatRelative, pluralise } from '../../../lib/format.js';
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

  const dispatch = useAppDispatch();
  const state = useAppSelector(selectPeopleList);
  useClearOnLeave(peopleListLeft());
  const term = state.searchDraft ?? q;
  const setTerm = (value: string): void => {
    dispatch(peopleSearchTyped({ term: value }));
  };
  const creating = state.adding !== null;
  const saving = state.adding?.saving ?? false;
  const formError = messageOf(state.adding?.error, FAILED.add);
  const assigning = state.assigningId;
  const { assignBusy, importing, invite, invitingId } = state;
  const rowError = state.rowError
    ? { id: state.rowError.id, text: messageOf(state.rowError.error, FAILED[state.rowError.during]) ?? '' }
    : null;

  const filtered = Boolean(q || unitId || roleId);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;
  const pending = rows.find((row) => row.id === state.removingId) ?? null;

  const setFilter = (patch: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('cursor');
    setParams(next);
  };

  const invitePerson = (person: PersonSummary): void => {
    void dispatch(accountLinkMade({ personId: person.id, mode: 'invite', from: 'list' }));
  };

  // Added: straight into the position editor for them, for whoever may assign one
  // (34 § Interactions). The slice does that on `personAdded.fulfilled`.
  const submit = (draft: PersonDraft): void => {
    void dispatch(personAdded({ body: draft, thenAssign: can('assignment.create') }));
  };

  const addPosition = (person: PersonSummary, draft: PositionDraft): void => {
    void dispatch(
      positionAdded({
        personId: person.id,
        body: { roleId: draft.roleId, unitId: draft.unitId, isPrimary: draft.isPrimary },
        from: 'list',
      }),
    );
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
              onCommit={(name) => void dispatch(personRenamed({ personId: row.id, name, from: 'list' }))}
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
                  ? () =>
                      void dispatch(positionRemoved({ personId: row.id, edgeId: position.edgeId, from: 'list' }))
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
              onCancel={() => dispatch(rowPositionClosed())}
            />
          ) : (
            can('assignment.create') && (
              <button
                type="button"
                className="btn btn-ghost btn-tiny"
                onClick={() => dispatch(rowPositionOpened({ personId: row.id }))}
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
          <button type="button" className="btn btn-ghost" onClick={() => dispatch(removePersonAsked({ personId: row.id }))}>
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
          can('person.create') && !(rows.length === 0 && !filtered) ? (
            <>
              {can('person.import') && (
                <button type="button" className="btn btn-secondary" onClick={() => dispatch(importOpened())}>
                  Import
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => dispatch(addPersonOpened())}>
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
          {list.error instanceof ApiError ? list.error.message : 'Could not load people.'}{' '}
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
                    <button type="button" className="btn btn-primary" onClick={() => dispatch(addPersonOpened())}>
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
          onCancel={() => dispatch(addPersonClosed())}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={`Remove ${pending.name}?`}
          consequence={removeConsequence(pending)}
          verb="Remove"
          destructive
          onConfirm={() => void dispatch(personRemoved({ personId: pending.id }))}
          onCancel={() => dispatch(removePersonDismissed())}
        />
      )}

      {invite && (
        <InviteLink
          url={invite.data.url}
          expiresAt={invite.data.expiresAt}
          label={invite.data.personName}
          onClose={() => dispatch(inviteLinkClosed())}
        />
      )}

      {importing && (
        <ImportWizard onClose={() => dispatch(importClosed())} />
      )}
    </>
  );
}

function removeConsequence(person: PersonSummary): string {
  const held = person.positions.length;
  if (held === 0) {
    return 'They hold no positions, so nothing else changes. Their past activity stays in the record.';
  }
  return `This also removes ${pluralise(held, 'position', 'positions')}, and everything those allowed them to do. Their past activity stays in the record.`;
}
