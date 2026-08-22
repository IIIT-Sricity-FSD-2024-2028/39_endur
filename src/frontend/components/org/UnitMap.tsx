// The organisation, drawn as the graph it actually is. 32, 24 §3.
//
// Endur's whole claim is that an organisation is nodes joined by edges rather than a fixed
// set of tables. Everywhere else in the product that graph is presented as an indented list,
// which is the right shape for EDITING it and the wrong shape for SEEING it: a list tells
// you what is under what, and hides how wide, how deep, and how evenly the thing branches.
//
// So this is a read-only map that sits above the editable tree, not a replacement for it.
// Clicking a node selects it, which is the same selection the tree and the detail panel
// already share — one selected unit, three views of it.
//
// LAYOUT is the textbook tidy-tree simplification: x is decided by depth, y is assigned to
// leaves in order and every parent then sits at the midpoint of its children. It is O(n),
// it never crosses an edge, and for the depth-and-breadth real organisations have it is
// indistinguishable from the full Reingold–Tilford algorithm.
//
// Left-to-right rather than top-down. Organisations are deep and narrow far more often than
// they are wide, and a top-down chart of a deep one is a column of boxes that runs off the
// bottom of the screen while the width sits empty.
import { useMemo } from 'react';
import type { UnitNode } from '@endur/shared';
import { pluralise } from '../../lib/format.js';

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
  people: number;
  subjects: number;
  parent: Placed | null;
};

/** SVG has no text truncation, so the string is cut to fit the box before it is drawn. */
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
      people: node.peopleCount ?? 0,
      subjects: node.subjectCount ?? 0,
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
    // The midpoint of the FIRST and LAST child, not the mean of all of them: the mean
    // drags a parent toward whichever side happens to have more children and the trunk
    // stops looking like a spine.
    entry.y = first && last ? (first.y + last.y) / 2 : PAD;
    return entry;
  };

  nodes.forEach((root) => walk(root, 0, null));

  const width = placed.reduce((max, node) => Math.max(max, node.x + NODE_W), 0) + PAD;
  const height = placed.reduce((max, node) => Math.max(max, node.y + NODE_H), 0) + PAD;
  return { placed, width, height };
}

/** Parent's right edge to child's left edge, as a flat-shouldered cubic. The control points
 *  sit half a column out from each end, which keeps every curve the same shape however far
 *  apart the two nodes are — a curve whose bulge scales with distance reads as a different
 *  kind of connection at each depth. */
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
  /** The organisation's plural word for a subject. Never written here (INV-001). */
  subjectWord: string;
  /**
   * And its PLURAL word for a unit, for the same reason.
   *
   * This label said "units" until it was caught by hand. `audit:vocab` did not: it hunts
   * the ENGLISH domain nouns a preset would have replaced (Department, Course, Student),
   * and "unit" is Endur's own generic name for the concept, so it reads as structural.
   * It is not — nothing in the product ever says "unit" to a reader, and a screen-reader
   * user would have been the only person hearing it.
   */
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
        // NOT role="img" once the nodes are pressable. `img` makes the whole subtree
        // presentational, so the buttons inside it stop existing for a screen reader even
        // though they are still in the tab order — the worst of both: reachable by keyboard,
        // invisible to the thing announcing what you reached.
        role={onSelect ? 'group' : 'img'}
        aria-label={`Map of ${placed.length} ${unitWord}`}
      >
        <g className="unit-map-edges">
          {edges.map((node, index) => (
            <path
              key={`edge-${node.id}`}
              className="unit-edge"
              d={edgePath(node.parent!, node)}
              // `pathLength="1"` renormalises the geometry so a dash of 1 is exactly the
              // whole line, whatever its real length. Without it every edge would need its
              // length measured in the DOM before it could be drawn on.
              pathLength={1}
              style={{ animationDelay: `${120 + index * 45}ms` }}
            />
          ))}
        </g>

        {placed.map((node, index) => {
          const selected = node.id === selectedId;
          // "1" on its own is not a fact. People are always named; the subject count only
          // appears when there is one, because a trailing "· 0" on most rows is noise.
          const meta =
            node.subjects > 0
              ? `${pluralise(node.people, 'person', 'people')} · ${node.subjects} ${subjectWord}`
              : pluralise(node.people, 'person', 'people');
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
