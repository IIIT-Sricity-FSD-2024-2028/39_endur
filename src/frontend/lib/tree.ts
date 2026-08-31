// Pure helpers over the unit tree. Owned by 32, used by every page that filters by unit.
//
// SEPARATE FROM `lib/units.ts` on purpose. That module holds `useUnits()`, which every page
// test replaces with `vi.mock` — and a pure function living inside a mocked module is one
// every such mock has to reimplement. Found the moment this was lifted: two suites went red
// asking for a `flattenUnits` export their mock did not have, which is the mock telling you
// the function is in the wrong file.
import type { UnitNode } from '@endur/shared';

/**
 * The tree, flattened for a `<select>`; indentation carries the shape a tree would show.
 *
 * Lifted here at T-040, when a THIRD copy was about to be written. `35`'s subject filter and
 * `38`'s audience picker each had their own, character-identical — which is how two of them
 * quietly stop agreeing about depth. A `<select>` rather than `<UnitTree>` is deliberate
 * everywhere it appears: the question is "which one unit", and a tree answers a question
 * about structure that nobody is asking inside a filter bar.
 */
export function flattenUnits(nodes: UnitNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'\xa0 \xa0 '.repeat(depth)}${node.name}` },
    ...flattenUnits(node.children, depth + 1),
  ]);
}
