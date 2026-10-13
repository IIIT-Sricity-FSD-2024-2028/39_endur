import { useEffect, useState } from 'react';
import type { Label } from '@endur/shared';
import { Icon } from '../Icon.js';
import { InlineName } from './InlineName.js';
import { pluralise } from '../../lib/format.js';
import { branchOf, type Totals } from '../../lib/unitTotals.js';

export type UnitTreeNode = {
  id: string;
  name: string;
  children: UnitTreeNode[];
  peopleCount?: number;
  subjectCount?: number;
  peopleTotal?: number;
  subjectTotal?: number;
  isTemporary?: boolean;
  endsAt?: string | null;
  placeholder?: string;
};

export type UnitTreeMode = 'browse' | 'edit' | 'select';

export type UnitTreeRequest = { id: string; action: 'rename' | 'move'; nonce: number };

type Props = {
  nodes: UnitTreeNode[];
  mode: UnitTreeMode;
  selectedId?: string | undefined;
  addLabel?: string | undefined;
  subjectWord?: Label | undefined;
  focusId?: string | undefined;
  request?: UnitTreeRequest | undefined;
  rowMessage?: { id: string; text: string } | undefined;
  onSelect?: ((id: string) => void) | undefined;
  onRename?: ((id: string, name: string) => void) | undefined;
  onCancelEdit?: ((id: string) => void) | undefined;
  onAddChild?: ((parentId: string) => void) | undefined;
  onDelete?: ((id: string) => void) | undefined;
  onReparent?: ((id: string, newParentId: string) => void) | undefined;
};

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
  const [movingId, setMovingId] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!request) return;
    if (request.action === 'move') setMovingId(request.id);
    else setFocusRow(request.id);
    // Depending on the nonce rather than the id is the point: Rename, Rename again on the
    // same row, is two requests, and only the nonce distinguishes them.
  }, [request?.nonce, request?.id, request?.action]);

  const active = movingId ?? dragId;
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
    const isRoot = depth === 0;
    const canDrop = active !== null && active !== node.id && !forbidden.has(node.id);
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

          {/* The branch, straight off the node — the server walked the tree (DEC-082).
              The wizard's draft carries no counts at all and reads as zeroes, which
              `<Counts>` renders as nothing, so its call site is unaffected. */}
          <Counts total={branchOf(node)} subjectWord={props.subjectWord} />

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

function Counts({ total, subjectWord }: { total: Totals; subjectWord?: Label | undefined }): JSX.Element | null {
  const parts: string[] = [];
  if (total.people) parts.push(pluralise(total.people, 'person', 'people'));
  if (total.subjects && subjectWord) parts.push(pluralise(total.subjects, subjectWord.one, subjectWord.many));
  if (parts.length === 0) return null;
  return <span className="text-meta unit-count">{parts.join(' · ')}</span>;
}
