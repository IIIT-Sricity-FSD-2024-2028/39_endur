// The ambient layer (DEC-029). 24 §2.
//
// This exists for two reasons and neither of them is decoration.
//
// The first is structural: every surface in the product is now translucent, and a blur with
// nothing behind it is just a grey rectangle. The glass needs a field with colour and
// variation in it before it can look like glass.
//
// The second is that the field may as well say something true. Endur's whole claim is that
// an organisation is a graph — nodes joined by edges, with feedback travelling along them —
// so the background is a sparse lattice of exactly that, drifting slowly, with a pulse
// running an edge now and then. A page of floating gradient blobs would have done the
// optical job and meant nothing.
//
// It is `aria-hidden` and `pointer-events: none` throughout: it is wallpaper, and nothing
// here is content, focusable, or announced. Under reduced-motion the drift and the pulses
// stop dead (the global rule in endur.css §motion), leaving a still lattice — which is a
// composition, not a broken animation.

/** A tiny deterministic PRNG. The lattice must be identical on every render and every
 *  reload — a layout that reshuffles when React re-renders reads as the page flickering,
 *  and `Math.random()` in a component body is exactly how that happens. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

type Node = { x: number; y: number; r: number };

/** Poisson-ish scatter: candidates are rejected until they clear every node already placed.
 *  Pure random scatter clumps, and a clump in a background lattice reads as a smudge. */
function buildNodes(count: number, rand: () => number): Node[] {
  const nodes: Node[] = [];
  let guard = 0;
  while (nodes.length < count && guard < count * 60) {
    guard += 1;
    // Small. The viewBox is 100 units wide and sliced to cover the viewport, so on a
    // 1440px screen one unit is roughly 14px — a radius of 1 is a 28px disc, which reads
    // as a bubble floating over the page rather than as a node in a diagram.
    const candidate = { x: rand() * 100, y: rand() * 100, r: 0.2 + rand() * 0.36 };
    const tooClose = nodes.some(
      (node) => Math.hypot(node.x - candidate.x, node.y - candidate.y) < 13,
    );
    if (!tooClose) nodes.push(candidate);
  }
  return nodes;
}

/** Join each node only to near neighbours. Joining everything to everything produces a mesh,
 *  and a mesh at this opacity is a grey wash with no structure left in it. */
function buildEdges(nodes: Node[]): Array<[Node, Node]> {
  const edges: Array<[Node, Node]> = [];
  nodes.forEach((from, index) => {
    nodes.slice(index + 1).forEach((to) => {
      if (Math.hypot(from.x - to.x, from.y - to.y) < 23) edges.push([from, to]);
    });
  });
  return edges;
}

const RAND = seeded(20260826);
const NODES = buildNodes(26, RAND);
const EDGES = buildEdges(NODES);
/** Four edges carry a travelling pulse. Every edge pulsing is a light show; four is a
 *  system quietly doing something in the background, which is the intended read. */
const PULSING = EDGES.filter((_, index) => index % 7 === 3).slice(0, 4);

export function AmbientBackground({
  variant = 'default',
}: {
  /** `hero` turns the colour fields up for the landing page, where the ambient layer is
   *  part of the composition rather than something the console sits quietly on top of. */
  variant?: 'default' | 'hero';
}): JSX.Element {
  return (
    <div className={`ambient ambient-${variant}`} aria-hidden="true">
      {/* The colour. Three fields on different periods so they never return to the same
          arrangement — a two-field drift visibly repeats within about a minute. */}
      <span className="ambient-field ambient-field-1" />
      <span className="ambient-field ambient-field-2" />
      <span className="ambient-field ambient-field-3" />

      {/* The structure. */}
      <svg className="ambient-lattice" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <g className="ambient-lattice-drift">
          {EDGES.map(([from, to], index) => (
            <line
              key={`e${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="ambient-edge"
            />
          ))}
          {PULSING.map(([from, to], index) => (
            <line
              key={`p${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="ambient-pulse"
              // Staggered so the four never fire together, which would read as a flash
              // rather than as traffic.
              style={{ animationDelay: `${index * 2.6}s` }}
            />
          ))}
          {NODES.map((node, index) => (
            <circle
              key={`n${index}`}
              cx={node.x}
              cy={node.y}
              r={node.r}
              className="ambient-node"
              style={{ animationDelay: `${(index % 6) * 0.9}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
