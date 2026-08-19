// <UnitTree> — 24 §4, design_specs/design/03 §3.3, 32.
//
// ONE COMPONENT, THREE PLACEMENTS (INV-009): wizard step 3, /app/structure, and the
// campaign audience picker. `mode` is what makes that possible, and forking it is how the
// three quietly stop agreeing about what a unit is.
//
// It takes the LEAST it needs — id, name, children — so the API's `UnitNode` satisfies it
// without adaptation and the wizard's draft satisfies it without inventing counts it does
// not have yet.
//
// HTML5 drag is NOT the only way to re-parent. It does not exist on touch at all, and 31 §
// Acceptance requires the tree to be usable there, so every row also has a Move control
// that works by click and by keyboard: press Move, then choose the new parent. The drag
// path and the move path call the same `onReparent`.
//
// T-033 EXTENDED this component rather than writing a second one (N-025). Everything the
// structure page needed — the temporary badge, counts with the caller's vocabulary, an
// inline refusal message, a placeholder row for "+ then type" — is optional, so the
// wizard's call site did not change at all.
import { useEffect, useState } from 'react';
import { Icon } from '../Icon.js';
import { InlineName } from './InlineName.js';

export type UnitTreeNode = {
  id: string;
  name: string;
  children: UnitTreeNode[];
  peopleCount?: number;
  subjectCount?: number;
  isTemporary?: boolean;
  /** ISO date. Within 30 days the row says so, because expiry is silent otherwise (10 §9). */
  endsAt?: string | null;
  /** Shown when the name is empty — the row `+` just created, waiting for two words. */
  placeholder?: string;
};

export type UnitTreeMode = 'browse' | 'edit' | 'select';

/**
 * An action asked for from outside the tree — the detail panel's Rename and Move buttons
 * (design_specs/design/04 §4.2). `nonce` is what makes asking twice for the same row work;
 * without it the second click on an unchanged id would be a no-op.
 */
export type UnitTreeRequest = { id: string; action: 'rename' | 'move'; nonce: number };

type Props = {
  nodes: UnitTreeNode[];
  mode: UnitTreeMode;
  selectedId?: string | undefined;
  /** Label for the add-child button, e.g. "Add a Department". Vocabulary, from the caller. */
  addLabel?: string | undefined;
  /** Plural of the subject noun, e.g. "Courses". Absent means subject counts stay hidden. */
  subjectWord?: string | undefined;
  /** Focus this row's name input on mount — the "+ then type" beat of the demo. */
  focusId?: string | undefined;
  request?: UnitTreeRequest | undefined;
  /** A refusal from the server, shown under the row it belongs to rather than in a dialog. */
  rowMessage?: { id: string; text: string } | undefined;
  onSelect?: ((id: string) => void) | undefined;
  onRename?: ((id: string, name: string) => void) | undefined;
  /** Escape, or a blur with the field empty. The structure page drops its placeholder row. */
  onCancelEdit?: ((id: string) => void) | undefined;
  onAddChild?: ((parentId: string) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  onReparent?: ((id: string, newParentId: string) => void) | undefined;
};

/** Every id at or below `node` — the set a node may not be moved into. */
function subtreeIds(node: UnitTreeNode, into: Set<string> = new Set()): Set<string> {
  into.add(node.id);
  for (const child of node.children) subtreeIds(child, into);
  return into;
}

const findNode = (nodes: UnitTreeNode[], id: string): UnitTreeNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return undefined;
};

const DAY = 86_400_000;

/** Days until an end date, or null when there is none. Negative means it has passed. */
export function daysUntil(endsAt: string | null | undefined, now = Date.now()): number | null {
  if (!endsAt) return null;
  const time = new Date(endsAt).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - now) / DAY);
}

export function UnitTree(props: Props): JSX.Element {
  const { nodes, mode, addLabel, onReparent, request } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** The row waiting for a destination, when Move was pressed instead of dragged. */
  const [movingId, setMovingId] = useState<string | null>(null);
  /** Asked for by the detail panel; merged with `focusId` so the wizard is unaffected. */
  const [focusRow, setFocusRow] = useState<string | null>(null);
  /** "That would put it inside itself" — the tree's own refusal, not the server's. */
  const [refusal, setRefusal] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!request) return;
    if (request.action === 'move') setMovingId(request.id);
    else setFocusRow(request.id);
    // Depending on the nonce rather than the id is the point: Rename, Rename again on the
    // same row, is two requests, and only the nonce distinguishes them.
  }, [request?.nonce, request?.id, request?.action]);

  const active = movingId ?? dragId;
  // A node cannot become its own descendant's child. Computed once per drag rather than
  // per row, because the answer is the same for every row it passes over.
  const activeNode = active ? findNode(nodes, active) : undefined;
  const forbidden = active
    ? subtreeIds(activeNode ?? { id: active, name: '', children: [] })
    : new Set<string>();

  const toggle = (id: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stop = (): void => {
    setMovingId(null);
    setDragId(null);
    setOverId(null);
  };

  const complete = (targetId: string): void => {
    if (!active) return;
    if (forbidden.has(targetId)) {
      // Refused inline, on the row being moved, and never as a dialog: the reader is
      // mid-gesture and a modal would make them lose their place (32 § Interactions).
      setRefusal({
        id: active,
        text: `${activeNode?.name ?? 'That'} cannot go inside itself.`,
      });
      stop();
      return;
    }
    setRefusal(null);
    onReparent?.(active, targetId);
    stop();
  };

  const render = (node: UnitTreeNode, depth: number): JSX.Element => {
    const hasChildren = node.children.length > 0;
    const isOpen = !collapsed.has(node.id);
    // The root is the organisation. It cannot be deleted or moved, in any mode — deleting
    // it would leave an org with nowhere to put anything.
    const isRoot = depth === 0;
    const canDrop = active !== null && active !== node.id && !forbidden.has(node.id);
    // While a move is in flight every row accepts the drop event, including the ones that
    // may not have it. Refusing at `dragover` would swallow the drop silently, and the
    // reader would be left wondering whether the gesture registered at all.
    const dropTarget = active !== null && active !== node.id;
    const message =
      props.rowMessage?.id === node.id
        ? props.rowMessage.text
        : refusal?.id === node.id
          ? refusal.text
          : null;
    const endsIn = daysUntil(node.endsAt);

    return (
      <li key={node.id}>
        <div
          className={[
            'unit-row',
            props.selectedId === node.id ? 'is-selected' : '',
            overId === node.id && canDrop ? 'is-drop' : '',
            overId === node.id && !canDrop && dropTarget ? 'is-refused' : '',
            active === node.id ? 'is-moving' : '',
            canDrop ? 'is-droppable' : '',
          ].filter(Boolean).join(' ')}
          style={{ paddingLeft: `${depth * (depth > 3 ? 20 : 28) + 8}px` }}
          draggable={mode === 'edit' && !isRoot && onReparent !== undefined}
          onDragStart={() => setDragId(node.id)}
          onDragEnd={() => stop()}
          onDragOver={(event) => {
            if (!dropTarget) return;
            event.preventDefault();
            setOverId(node.id);
          }}
          onDrop={(event) => { event.preventDefault(); complete(node.id); }}
          onClick={mode === 'edit' && props.onSelect ? () => props.onSelect?.(node.id) : undefined}
        >
          {hasChildren ? (
            <button
              type="button"
              className="unit-twist"
              onClick={() => toggle(node.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
            >
              <Icon name={isOpen ? 'chevron' : 'disclosure'} size={16} />
            </button>
          ) : (
            <span className="unit-twist" aria-hidden="true" />
          )}

          <Icon name={isRoot ? 'organization' : 'structure'} size={16} className="unit-icon" />

          {mode === 'edit' && props.onRename ? (
            <InlineName
              value={node.name}
              autoFocus={props.focusId === node.id || focusRow === node.id}
              placeholder={node.placeholder}
              onCommit={(name) => props.onRename?.(node.id, name)}
              onCancel={props.onCancelEdit ? () => props.onCancelEdit?.(node.id) : undefined}
              ariaLabel="Name"
            />
          ) : mode === 'select' && props.onSelect ? (
            <button type="button" className="unit-name unit-pick" onClick={() => props.onSelect?.(node.id)}>
              {node.name}
            </button>
          ) : (
            <span className="unit-name">{node.name}</span>
          )}

          {node.isTemporary && <span className="tag tag-warn unit-temp">Temporary</span>}
          {endsIn !== null && endsIn <= 30 && (
            <span className="tag tag-warn unit-ends">
              {endsIn < 0 ? 'Ended' : endsIn === 0 ? 'Ends today' : `Ends in ${endsIn} days`}
            </span>
          )}

          <Counts node={node} subjectWord={props.subjectWord} />

          {mode === 'edit' && (
            <span className="unit-actions">
              {active !== null && canDrop && (
                <button type="button" className="btn btn-ghost unit-here" onClick={() => complete(node.id)}>
                  Move here
                </button>
              )}
              {props.onAddChild && (
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => props.onAddChild?.(node.id)}
                  title={addLabel}
                >
                  <Icon name="add" size={16} label={addLabel ?? `Add inside ${node.name}`} />
                </button>
              )}
              {onReparent && !isRoot && (
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => setMovingId(movingId === node.id ? null : node.id)}
                  aria-pressed={movingId === node.id}
                >
                  <Icon name="drag" size={16} label={movingId === node.id ? `Cancel moving ${node.name}` : `Move ${node.name}`} />
                </button>
              )}
              {props.onDelete && !isRoot && (
                <button type="button" className="btn btn-icon" onClick={() => props.onDelete?.(node.id)}>
                  <Icon name="delete" size={16} label={`Delete ${node.name}`} />
                </button>
              )}
            </span>
          )}
        </div>

        {message && (
          <p className="unit-row-message" role="alert" style={{ paddingLeft: `${depth * 28 + 34}px` }}>
            {message}
          </p>
        )}

        {hasChildren && isOpen && (
          <ul className="unit-children">{node.children.map((child) => render(child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <div className={active ? 'unit-tree is-relocating' : 'unit-tree'}>
      {movingId && (
        <p className="unit-moving-hint text-meta" role="status">
          Choose where <strong>{findNode(nodes, movingId)?.name}</strong> should go, or press
          {' '}
          <button type="button" className="btn btn-ghost" onClick={() => stop()}>
            cancel
          </button>.
        </p>
      )}
      <ul className="unit-root">{nodes.map((node) => render(node, 0))}</ul>
    </div>
  );
}

/** "64 people · 7 Courses". The subject noun is the caller's; "people" is structural. */
function Counts({ node, subjectWord }: { node: UnitTreeNode; subjectWord?: string | undefined }): JSX.Element | null {
  const parts: string[] = [];
  if (node.peopleCount) parts.push(`${node.peopleCount} ${node.peopleCount === 1 ? 'person' : 'people'}`);
  if (node.subjectCount && subjectWord) parts.push(`${node.subjectCount} ${subjectWord}`);
  if (parts.length === 0) return null;
  return <span className="text-meta unit-count">{parts.join(' · ')}</span>;
}
