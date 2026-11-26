// The org's tree. What is selected, being added, asked of the tree, or being deleted is
// `state.structure` (store/screens/structure.ts); every command is a thunk there.
// docs/REDUX-PLAN.md §6.10.
import { useMemo } from 'react';
import {
  MAX_REPEAT,
  parseUnitRange,
  repeatCount,
  type CreateUnitBody,
  type UnitNode,
} from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { UnitTree } from '../../../components/org/UnitTree.js';
import { UnitMap } from '../../../components/org/UnitMap.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { useUnitImpact, useUnits } from '../../../lib/units.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { useClearOnLeave } from '../../../store/screens/common.js';
import {
  isDraftRow as isDraft,
  rowMessageShown,
  selectStructure,
  structurePageLeft,
  treeAsked,
  unitDeleteAsked,
  unitDeleteDismissed,
  unitDeleted,
  unitDraftDropped,
  unitDraftStarted,
  unitReparented,
  unitRenamed,
  unitSelected,
  unitsCreated,
  type UnitDraft as Draft,
} from '../../../store/screens/structure.js';
import { pluralise } from '../../../lib/format.js';
import { DetailPanel } from './DetailPanel.js';
import { Overview } from './Overview.js';
import { checkingConsequence, deleteConsequence, unknownConsequence } from './consequence.js';


const findById = (nodes: UnitNode[], id: string): UnitNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findById(node.children, id);
    if (found) return found;
  }
  return undefined;
};

const countUnits = (nodes: UnitNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countUnits(node.children), 0);

const depthOf = (nodes: UnitNode[]): number =>
  nodes.reduce((deepest, node) => Math.max(deepest, 1 + depthOf(node.children)), 0);

function withDraft(nodes: UnitNode[], draft: Draft | null, placeholder: string): UnitNode[] {
  if (!draft) return nodes;
  const row: UnitNode = {
    id: draft.id, name: '', parentId: draft.parentId, isTemporary: false, endsAt: null,
    peopleCount: 0, subjectCount: 0, peopleTotal: 0, subjectTotal: 0,
    children: [], placeholder,
  } as UnitNode & { placeholder: string };

  if (draft.parentId === null) return [...nodes, row];
  return nodes.map((node) =>
    node.id === draft.parentId
      ? { ...node, children: [...node.children, row] }
      : { ...node, children: withDraft(node.children, draft, placeholder) },
  );
}

export default function Structure(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const units = useUnits();

  const dispatch = useAppDispatch();
  const { selectedId, draft, request, rowMessage, deletingId } = useAppSelector(selectStructure);
  useClearOnLeave(structurePageLeft());
  const setSelectedId = (unitId: string | null): void => {
    dispatch(unitSelected({ unitId }));
  };

  const addLabel = `Add a ${labels.unit.one}`;
  // Memoised so the empty fallback is one array, not a new one per render that re-runs the tree below.
  const data = useMemo(() => units.data ?? [], [units.data]);
  const tree = useMemo(() => withDraft(data, draft, addLabel), [data, draft, addLabel]);
  const selected = selectedId ? findById(data, selectedId) : undefined;
  const pending = deletingId ? (findById(data, deletingId) ?? null) : null;
  // What deleting it costs: read when the confirmation opens, fresh every time.
  const impact = useUnitImpact(pending?.id ?? null);

  const startDraft = (parentId: string | null): void => {
    dispatch(unitDraftStarted(parentId));
  };

  const ask = (id: string, action: 'rename' | 'move'): void => {
    dispatch(treeAsked({ id, action }));
  };

  const createFrom = (name: string, parentId: string | null, rowId: string): void => {
    const parsed = parseUnitRange(name);
    const count = parsed.repeat ? repeatCount(parsed.repeat) : 1;
    if (count > MAX_REPEAT) {
      dispatch(rowMessageShown({
        id: rowId,
        text: `That would create ${pluralise(count, labels.unit.one, labels.unit.many)}. The most in one go is ${MAX_REPEAT}.`,
      }));
      return;
    }

    const body: CreateUnitBody = {
      name: parsed.name,
      parentId,
      isTemporary: false,
      ...(parsed.repeat ? { repeat: parsed.repeat } : {}),
    };
    void dispatch(unitsCreated({ body, rowId, failure: `${parsed.name} could not be created.` }));
  };

  const handleRename = (id: string, name: string): void => {
    if (isDraft(id)) {
      createFrom(name, draft?.parentId ?? null, id);
      return;
    }
    void dispatch(unitRenamed({ rowId: id, name, failure: 'That name could not be saved.' }));
  };

  const handleReparent = (id: string, newParentId: string): void => {
    void dispatch(unitReparented({ rowId: id, newParentId, failure: 'That move could not be saved.' }));
  };

  const confirmDelete = (): void => {
    if (!pending || !impact.data) return;
    const reassign = pending.children.length > 0 ? (pending.parentId ?? undefined) : undefined;
    void dispatch(
      unitDeleted({ rowId: pending.id, reassignChildrenTo: reassign, failure: `${pending.name} could not be deleted.` }),
    );
  };

  const total = countUnits(data);
  const depth = depthOf(data);
  const roots = data.map((node) => node.name);

  return (
    <>
      <PageHeader
        title={labels.unit.many}
        subtitle={
          total > 0
            ? `${pluralise(total, labels.unit.one, labels.unit.many)}, ${depth} ${depth === 1 ? 'level' : 'levels'} deep`
            : undefined
        }
        scope={{ label: roots.length === 1 ? (roots[0] ?? '') : 'Everything you can see' }}
        action={
          can('unit.create') && total > 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => startDraft(data[0]?.id ?? null)}>
              <Icon name="add" size={18} /> {addLabel}
            </button>
          ) : undefined
        }
      />

      {units.error && (
        <p className="form-error" role="alert">
          {units.error instanceof ApiError ? units.error.message : 'Could not load the structure.'}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void units.reload()}>
            Try again
          </button>
        </p>
      )}

      {units.loading && !units.data && (
        <div className="card tree-card" aria-hidden="true">
          <div className="tree-skeleton">
            {[0, 1, 2, 3].map((row) => (
              <span key={row} className="skeleton-row" style={{ marginLeft: `${row * 20}px` }} />
            ))}
          </div>
        </div>
      )}

      {units.data && total === 0 && !draft && (
        <EmptyState
          icon="structure"
          title={`No ${labels.unit.many} yet`}
          body={`This is the shape of your organization — everything else is scoped against it. Setup usually creates the first one.`}
          action={
            can('unit.create') ? (
              <button type="button" className="btn btn-primary" onClick={() => startDraft(null)}>
                {addLabel}
              </button>
            ) : undefined
          }
        />
      )}

      {/* Derived from `data`, not `tree` — the unnamed draft row is not a unit yet, and
          counting it would make the totals flicker while somebody is still typing. */}
      {total > 0 && <Overview nodes={data} totals={units.totals} labels={labels} />}

      {total > 0 && (
        <section className="card structure-map-card" aria-labelledby="map-heading">
          <p className="utility" id="map-heading">The shape of it</p>
          <UnitMap
            nodes={data}
            selectedId={selectedId ?? undefined}
            subjectWord={labels.subject}
            unitWord={labels.unit.many}
            onSelect={setSelectedId}
          />
        </section>
      )}

      {(tree.length > 0 || draft) && (
        <div className="structure">
          <div className="card tree-card structure-tree">
            <UnitTree
              nodes={tree}
              mode="edit"
              addLabel={addLabel}
              subjectWord={labels.subject}
              selectedId={selectedId ?? undefined}
              focusId={draft?.id}
              request={request ?? undefined}
              rowMessage={rowMessage ?? undefined}
              onSelect={setSelectedId}
              onRename={can('unit.update') || can('unit.create') ? handleRename : undefined}
              onCancelEdit={(id) => dispatch(unitDraftDropped({ id }))}
              onAddChild={can('unit.create') ? startDraft : undefined}
              onDelete={can('unit.delete') ? (id) => dispatch(unitDeleteAsked({ unitId: id })) : undefined}
              onReparent={can('unit.reparent') ? handleReparent : undefined}
            />
          </div>

          {selected && (
            <DetailPanel
              node={selected}
              parentName={selected.parentId ? (findById(data, selected.parentId)?.name ?? null) : null}
              labels={labels}
              canRename={can('unit.update')}
              canMove={can('unit.reparent') && selected.parentId !== null}
              canDelete={can('unit.delete') && selected.parentId !== null}
              canReadPeople={can('person.read')}
              onRename={() => ask(selected.id, 'rename')}
              onMove={() => ask(selected.id, 'move')}
              onDelete={() => dispatch(unitDeleteAsked({ unitId: selected.id }))}
            />
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`Delete ${pending.name}?`}
          consequence={
            impact.error
              ? unknownConsequence(pending.name)
              : impact.data
                ? deleteConsequence({
                    name: pending.name,
                    impact: impact.data,
                    parentName: pending.parentId
                      ? (findById(data, pending.parentId)?.name ?? null)
                      : null,
                    own: { people: pending.peopleCount, subjects: pending.subjectCount },
                    labels,
                  })
                : checkingConsequence(pending.name)
          }
          verb="Delete"
          destructive
          confirmDisabled={!impact.data}
          onConfirm={confirmDelete}
          onCancel={() => dispatch(unitDeleteDismissed())}
        />
      )}
    </>
  );
}
