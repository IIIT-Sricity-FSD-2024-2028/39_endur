import { useMemo } from 'react';
import type { Label, UnitNode } from '@endur/shared';
import { pluralise } from '../../lib/format.js';
import { branchOf, ownOf, type Totals } from '../../lib/unitTotals.js';

const COLUMN = 224;   // horizontal distance between depths
const ROW = 56;       // vertical distance between leaves
const NODE_W = 186;
const NODE_H = 42;
const PAD = 18;

type Placed = {
  id: string;
  name: string;
  x: number;
  y: number;
  depth: number;
  total: Totals;
  own: Totals;
  hasChildren: boolean;
  parent: Placed | null;
};

function fit(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

function layout(nodes: UnitNode[]): { placed: Placed[]; width: number; height: number } {
  const placed: Placed[] = [];
  let nextLeafRow = 0;

  const walk = (node: UnitNode, depth: number, parent: Placed | null): Placed => {
    const entry: Placed = {
      id: node.id,
      name: node.name,
      x: PAD + depth * COLUMN,
      y: 0,
      depth,
      total: branchOf(node),
      own: ownOf(node),
      hasChildren: node.children.length > 0,
      parent,
    };
    placed.push(entry);

    if (node.children.length === 0) {
      entry.y = PAD + nextLeafRow * ROW;
      nextLeafRow += 1;
      return entry;
    }

    const children = node.children.map((child) => walk(child, depth + 1, entry));
    const first = children[0];
    const last = children[children.length - 1];
    entry.y = first && last ? (first.y + last.y) / 2 : PAD;
    return entry;
  };

  nodes.forEach((root) => walk(root, 0, null));

  const width = placed.reduce((max, node) => Math.max(max, node.x + NODE_W), 0) + PAD;
  const height = placed.reduce((max, node) => Math.max(max, node.y + NODE_H), 0) + PAD;
  return { placed, width, height };
}

function phrase(counts: Totals, subjectWord: Label): string {
  const people = pluralise(counts.people, 'person', 'people');
  if (counts.subjects === 0) return people;
  return `${people} and ${pluralise(counts.subjects, subjectWord.one, subjectWord.many)}`;
}

function nodeTitle(node: Placed, subjectWord: Label): string {
  if (!node.hasChildren) return `${node.name} — ${phrase(node.total, subjectWord)}`;

  const branch = `${node.name} — ${phrase(node.total, subjectWord)}, counting everything inside it`;
  const differs =
    node.total.people !== node.own.people || node.total.subjects !== node.own.subjects;
  return differs ? `${branch}. ${phrase(node.own, subjectWord)} placed here directly.` : `${branch}.`;
}

function edgePath(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const bend = (x2 - x1) / 2;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

export function UnitMap({
  nodes,
  selectedId,
  subjectWord,
  unitWord,
  onSelect,
}: {
  nodes: UnitNode[];
  selectedId?: string | undefined;
  subjectWord: Label;
  unitWord: string;
  onSelect?: ((id: string) => void) | undefined;
}): JSX.Element | null {
  const { placed, width, height } = useMemo(() => layout(nodes), [nodes]);
  if (placed.length === 0) return null;

  const edges = placed.filter((node) => node.parent !== null);

  return (
    <div className="unit-map-scroll">
      <svg
        className="unit-map"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role={onSelect ? 'group' : 'img'}
        aria-label={`Map of ${placed.length} ${unitWord}`}
      >
        <g className="unit-map-edges">
          {edges.map((node, index) => (
            <path
              key={`edge-${node.id}`}
              className="unit-edge"
              d={edgePath(node.parent!, node)}
              pathLength={1}
              style={{ animationDelay: `${120 + index * 45}ms` }}
            />
          ))}
        </g>

        {placed.map((node, index) => {
          const selected = node.id === selectedId;
          const meta =
            node.total.subjects > 0
              ? `${pluralise(node.total.people, 'person', 'people')} · ${pluralise(node.total.subjects, subjectWord.one, subjectWord.many)}`
              : pluralise(node.total.people, 'person', 'people');
          return (
            <g
              key={node.id}
              className={selected ? 'unit-node is-selected' : 'unit-node'}
              transform={`translate(${node.x} ${node.y})`}
              style={{ animationDelay: `${node.depth * 90 + index * 30}ms` }}
              {...(onSelect
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-pressed': selected,
                    onClick: () => onSelect(node.id),
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(node.id);
                      }
                    },
                  }
                : {})}
            >
              {/* First child, so it is the accessible name and the hover tooltip both. */}
              <title>{nodeTitle(node, subjectWord)}</title>
              <rect className="unit-node-box" width={NODE_W} height={NODE_H} rx={12} />
              {/* The depth stripe. Colour is not carrying the meaning on its own — the
                  node's position already states its depth — so this is reinforcement. */}
              <rect className="unit-node-edge" width={3} height={NODE_H - 16} y={8} x={0} rx={2} />
              <text className="unit-node-name" x={14} y={18}>{fit(node.name)}</text>
              <text className="unit-node-meta" x={14} y={32}>{meta}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
