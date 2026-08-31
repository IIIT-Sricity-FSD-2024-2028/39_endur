// T-033 — /app/structure. 32, design_specs/design/04 §4.2.
//
// The unit tree is the substrate everything else scopes against, so every destructive
// action here states its real consequence in numbers before it happens.
//
// Three things are worth knowing before editing this file:
//
//   1. THE TREE IS `<UnitTree>` — the same component as wizard step 3 and, later, the
//      campaign audience picker (INV-009). T-033 extended it; it did not write a second
//      one. See _MEMORY.md N-025.
//   2. THE API DECIDES WHAT IS VISIBLE. `GET /units` returns the caller's subtree, rooted
//      at their own unit. Nothing here filters for permission reasons (INV-003), and
//      `useCan()` only decides which BUTTONS exist — never what data appears.
//   3. RENAME IS OPTIMISTIC, MOVE IS NOT. `lib/units.ts` explains why.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_REPEAT,
  parseUnitRange,
  repeatCount,
  type CreateUnitBody,
  type UnitImpact,
  type UnitNode,
} from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { UnitTree, type UnitTreeRequest } from '../../../components/org/UnitTree.js';
import { UnitMap } from '../../../components/org/UnitMap.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { unitImpact, useUnits } from '../../../lib/units.js';
import { pluralise } from '../../../lib/format.js';
import { DetailPanel } from './DetailPanel.js';
import { Overview } from './Overview.js';
import { checkingConsequence, deleteConsequence, unknownConsequence } from './consequence.js';

/** A row that exists only in the browser, waiting for a name. `+` creates one. */
const DRAFT = 'draft:';
const isDraft = (id: string): boolean => id.startsWith(DRAFT);

type Draft = { id: string; parentId: string | null };

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

/** The tree as rendered: the API's tree plus the unnamed row `+` just added, if any. */
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [request, setRequest] = useState<UnitTreeRequest | undefined>(undefined);
  const [rowMessage, setRowMessage] = useState<{ id: string; text: string } | undefined>(undefined);
  const [pending, setPending] = useState<UnitNode | null>(null);
  const [impact, setImpact] = useState<{ data: UnitImpact | null; error: Error | null }>({
    data: null, error: null,
  });
  const drafts = useRef(0);
  const nonce = useRef(0);

  const addLabel = `Add a ${labels.unit.one}`;
  const data = units.data ?? [];
  const tree = useMemo(() => withDraft(data, draft, addLabel), [data, draft, addLabel]);
  const selected = selectedId ? findById(data, selectedId) : undefined;

  // The impact call runs when the dialog opens, and the dialog is not actionable until it
  // answers (32). Deleting with unknown consequences is the thing this prevents.
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    setImpact({ data: null, error: null });
    void unitImpact(pending.id)
      .then((result) => {
        if (!cancelled) setImpact({ data: result, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setImpact({ data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const startDraft = (parentId: string | null): void => {
    drafts.current += 1;
    setRowMessage(undefined);
    setDraft({ id: `${DRAFT}${drafts.current}`, parentId });
  };

  const ask = (id: string, action: 'rename' | 'move'): void => {
    nonce.current += 1;
    setRequest({ id, action, nonce: nonce.current });
  };

  const failure = (error: unknown, fallback: string): string =>
    error instanceof ApiError ? error.message : fallback;

  /** The draft row committed. `Floor 1..8` here is eight units, in one request. */
  const createFrom = async (name: string, parentId: string | null, rowId: string): Promise<void> => {
    const parsed = parseUnitRange(name);
    const count = parsed.repeat ? repeatCount(parsed.repeat) : 1;
    if (count > MAX_REPEAT) {
      // Refused before the request, so the reader gets a number rather than a validation
      // envelope. The server refuses it too — that is the check that actually counts (32).
      setRowMessage({
        id: rowId,
        text: `That would create ${pluralise(count, labels.unit.one, labels.unit.many)}. The most in one go is ${MAX_REPEAT}.`,
      });
      return;
    }

    const body: CreateUnitBody = {
      name: parsed.name,
      parentId,
      isTemporary: false,
      ...(parsed.repeat ? { repeat: parsed.repeat } : {}),
    };
    try {
      await units.create(body);
      setDraft(null);
      setRowMessage(undefined);
    } catch (error) {
      setRowMessage({ id: rowId, text: failure(error, `${parsed.name} could not be created.`) });
    }
  };

  const handleRename = (id: string, name: string): void => {
    if (isDraft(id)) {
      void createFrom(name, draft?.parentId ?? null, id);
      return;
    }
    setRowMessage(undefined);
    void units.rename(id, name).catch((error: unknown) => {
      // The optimistic name has already been put back by `lib/units.ts`; this says why.
      setRowMessage({ id, text: failure(error, 'That name could not be saved.') });
    });
  };

  const handleReparent = (id: string, newParentId: string): void => {
    setRowMessage(undefined);
    void units.reparent(id, newParentId).catch((error: unknown) => {
      setRowMessage({ id, text: failure(error, 'That move could not be saved.') });
    });
  };

  const confirmDelete = (): void => {
    if (!pending || !impact.data) return;
    const node = pending;
    setPending(null);
    // Children go to the parent. Without somewhere to put them the server refuses, which
    // is why the dialog only offers delete for a node whose parent is visible.
    const reassign = node.children.length > 0 ? (node.parentId ?? undefined) : undefined;
    void units
      .remove(node.id, reassign)
      .then(() => {
        if (selectedId === node.id) setSelectedId(null);
      })
      .catch((error: unknown) => {
        setRowMessage({ id: node.id, text: failure(error, `${node.name} could not be deleted.`) });
      });
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
        // Fixed, not a dropdown: what the reader can see is decided by the API, and
        // offering a switcher here would suggest otherwise (OPEN-006).
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
          {failure(units.error, 'Could not load the structure.')}{' '}
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
              request={request}
              rowMessage={rowMessage}
              onSelect={setSelectedId}
              onRename={can('unit.update') || can('unit.create') ? handleRename : undefined}
              onCancelEdit={(id) => {
                if (draft?.id === id) setDraft(null);
              }}
              onAddChild={can('unit.create') ? startDraft : undefined}
              onDelete={can('unit.delete') ? (id) => setPending(findById(data, id) ?? null) : undefined}
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
              onDelete={() => setPending(selected)}
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
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
