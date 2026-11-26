// Subjects. The filters are the URL; the form, the archive confirmation and failures are
// `state.subjects` (store/screens/subjects.ts), every command a thunk there.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SubjectSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { InlineName } from '../../../components/org/InlineName.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { useSubjectList } from '../../../lib/subjects.js';
import { formatRelative, pluralise } from '../../../lib/format.js';
import { SubjectForm, type SubjectDraft } from './SubjectForm.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  FAILED,
  selectSubjectsScreen,
  subjectArchiveAsked,
  subjectArchiveDismissed,
  subjectArchived,
  subjectCreated,
  subjectFormClosed,
  subjectFormOpened,
  subjectRenamed,
  subjectSearchTyped,
  subjectsLeft,
} from '../../../store/screens/subjects.js';

export default function Subjects(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const unitId = params.get('unit') ?? '';
  const archived = params.get('archived') === 'true';
  const cursor = params.get('cursor') ?? undefined;

  const list = useSubjectList({ q, unitId, archived, cursor });
  const units = useUnits();
  const unitOptions = useMemo(() => flattenUnits(units.data ?? []), [units.data]);

  const dispatch = useAppDispatch();
  const screen = useAppSelector(selectSubjectsScreen);
  useClearOnLeave(subjectsLeft());
  const term = screen.searchDraft ?? q;
  const setTerm = (value: string): void => {
    dispatch(subjectSearchTyped({ term: value }));
  };
  const creating = screen.form?.mode === 'create';
  const saving = screen.form?.saving ?? false;
  const formError = messageOf(screen.form?.error, FAILED.save);
  const rowError = screen.failure
    ? { id: screen.failure.id, text: messageOf(screen.failure.error, FAILED[screen.failure.during]) ?? '' }
    : null;
  const startCreating = (): void => {
    dispatch(subjectFormOpened({
      mode: 'create',
      draft: { name: '', unitId: units.data?.[0]?.id ?? '', linkedUserId: null, linkedUserName: null },
    }));
  };

  const filtered = Boolean(q || unitId || archived);
  const rows = list.data?.data ?? [];
  const total = list.data?.meta.total ?? 0;
  const pending = rows.find((row) => row.id === screen.archivingId) ?? null;

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

  const submit = (draft: SubjectDraft): void => {
    void dispatch(subjectCreated({
      name: draft.name,
      unitId: draft.unitId,
      type: 'general',
      ...(draft.linkedUserId ? { linkedUserId: draft.linkedUserId } : {}),
    }));
  };

  const columns: Column<SubjectSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      render: (row) => (
        <span className="subject-name">
          {can('subject.update') && !row.archivedAt ? (
            <InlineName
              value={row.name}
              ariaLabel="Name"
              onCommit={(name) => {
                void dispatch(subjectRenamed({ subjectId: row.id, name }));
              }}
            />
          ) : (
            <span className="subject-name-text">{row.name}</span>
          )}
          {row.archivedAt && <span className="tag tag-neutral">Archived</span>}
          <Link className="btn btn-ghost" to={`/app/subjects/${row.id}`}>
            Open
          </Link>
          {rowError?.id === row.id && (
            <span className="field-error" role="alert">{rowError.text}</span>
          )}
        </span>
      ),
    },
    {
      key: 'unit',
      header: labels.unit.one,
      render: (row) => row.unitName ?? <span className="text-meta">—</span>,
    },
    {
      key: 'linked',
      header: 'Linked person',
      hideBelow: 'md',
      render: (row) =>
        row.linkedUserId ? (
          <span>{row.linkedUserName}</span>
        ) : (
          <span className="text-meta">—</span>
        ),
    },
    {
      key: 'active',
      header: `Active ${labels.campaign.many.toLowerCase()}`,
      hideBelow: 'sm',
      render: (row) => <span className="num">{row.activeCampaigns}</span>,
    },
    {
      key: 'responses',
      header: 'Responses',
      render: (row) => <span className="num">{row.totalResponses}</span>,
    },
    {
      key: 'last',
      header: 'Last response',
      hideBelow: 'md',
      render: (row) =>
        row.lastResponseAt ? (
          formatRelative(row.lastResponseAt)
        ) : (
          <span className="text-meta">None yet</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) =>
        can('subject.archive') && !row.archivedAt ? (
          <button type="button" className="btn btn-ghost" onClick={() => dispatch(subjectArchiveAsked({ subjectId: row.id }))}>
            Archive
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={labels.subject.many}
        subtitle={total > 0 ? pluralise(total, labels.subject.one, labels.subject.many) : undefined}
        filters={[
          ...(q ? [{ label: `Search: ${q}`, onClear: () => { setTerm(''); setFilter({ q: null }); } }] : []),
          ...(unitId
            ? [{
                label: `${labels.unit.one}: ${unitOptions.find((u) => u.id === unitId)?.label.trim() ?? ''}`,
                onClear: () => setFilter({ unit: null }),
              }]
            : []),
          ...(archived ? [{ label: 'Archived', onClear: () => setFilter({ archived: null }) }] : []),
        ]}
        action={
          can('subject.create') && !(rows.length === 0 && !filtered) ? (
            <button type="button" className="btn btn-primary" onClick={startCreating}>
              <Icon name="add" size={18} /> Add a {labels.subject.one}
            </button>
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
          <label className="sr-only" htmlFor="subject-search">
            Search {labels.subject.many}
          </label>
          <input
            id="subject-search"
            className="input"
            value={term}
            placeholder={`Search ${labels.subject.many.toLowerCase()}`}
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

        <label className="list-filter checkbox">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setFilter({ archived: event.target.checked ? 'true' : null })}
          />
          Show archived
        </label>
      </div>

      {list.error && (
        <p className="form-error" role="alert">
          {message(list.error, `Could not load ${labels.subject.many.toLowerCase()}.`)}{' '}
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
          caption={labels.subject.many}
          empty={
            filtered ? (
              <EmptyState
                icon="subject"
                title={`No ${labels.subject.many} match those filters`}
                body="Nothing here matches what you asked for. Clearing the filters brings the rest back."
                action={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { setTerm(''); setFilter({ q: null, unit: null, archived: null }); }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon="subject"
                title={`No ${labels.subject.many} yet`}
                body={`${labels.subject.many} are the things people give feedback about. Add one and it can go into a ${labels.campaign.one.toLowerCase()}.`}
                action={
                  can('subject.create') ? (
                    <button type="button" className="btn btn-primary" onClick={startCreating}>
                      Add a {labels.subject.one}
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
        <SubjectForm
          title={`Add a ${labels.subject.one}`}
          verb="Add"
          units={units.data ?? []}
          labels={labels}
          saving={saving}
          error={formError}
          canLinkPeople={can('person.read')}
          onSubmit={submit}
          onCancel={() => dispatch(subjectFormClosed())}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={`Archive ${pending.name}?`}
          consequence={archiveConsequence(pending, labels.campaign.many.toLowerCase())}
          verb="Archive"
          destructive
          onConfirm={() => void dispatch(subjectArchived({ subjectId: pending.id }))}
          onCancel={() => dispatch(subjectArchiveDismissed())}
        />
      )}
    </>
  );
}

export function archiveConsequence(subject: SubjectSummary, campaignWord: string): string {
  const kept = subject.totalResponses > 0
    ? `keeps its ${pluralise(subject.totalResponses, 'response', 'responses')} and `
    : '';
  return `Archiving ${subject.name} ${kept}removes it from new ${campaignWord}. Past results still include it.`;
}
