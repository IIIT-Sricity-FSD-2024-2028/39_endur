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
//
// THE NUMBERS ON A NODE COUNT ITS WHOLE BRANCH — DEC-081, and `lib/unitTotals.ts` carries
// the argument. A map exists to answer "how big is this part of the organisation", and the
// API's own-count primitive cannot answer it: before this, adding a ward changed the ward
// and left every box above it untouched. The branch is rolled up server-side (DEC-082),
// because people have to be counted DISTINCT and this side only ever held scalars to add.
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
  /** The branch: this unit and everything under it. What the box prints. */
  total: Totals;
  /** This unit alone. Never printed — it is what the hover title discloses, so a parent's
   *  own people are not silently absorbed into a number that looks like theirs. */
  own: Totals;
  hasChildren: boolean;
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
/** "3 people", "3 people and 1 Ward". The subject clause is dropped at zero — a trailing
 *  "and 0 Wards" on most rows is noise, and it is never the thing being asked. */
function phrase(counts: Totals, subjectWord: Label): string {
  const people = pluralise(counts.people, 'person', 'people');
  if (counts.subjects === 0) return people;
  return `${people} and ${pluralise(counts.subjects, subjectWord.one, subjectWord.many)}`;
}

/**
 * The hover and screen-reader text, which is where the branch/own split is disclosed.
 *
 * The box has room for one number and the branch total is the one worth having, but a
 * parent that says "9 people" while three of them are placed on the parent itself owes the
 * reader that sentence somewhere. A `<title>` costs no layout and, inside a pressable `<g>`,
 * becomes the button's accessible name — which was previously the two text runs jammed
 * together ("Surgery3 people · 1 Service").
 */
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
  /**
   * The organisation's word for a subject, BOTH numbers. Never written here (INV-001).
   *
   * It was the plural alone until DEC-081, which is how a hospital with one service in a
   * ward read "1 Services" on every leaf of the map. A count and a plural-only noun cannot
   * be composed correctly, and the pair is already what `organization.labels` stores —
   * "Faculty" pluralises to "Faculty", so the singular is not derivable either (`22` §2).
   */
  subjectWord: Label;
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
