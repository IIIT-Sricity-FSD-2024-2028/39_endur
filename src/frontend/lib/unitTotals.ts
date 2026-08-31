// What a number printed on a unit means — DEC-081, corrected by DEC-082.
//
// TWO NUMBERS EXIST FOR EVERY UNIT and both come from the API:
//   `peopleCount`  — distinct people placed on this unit alone
//   `peopleTotal`  — this unit and everything under it, counted distinct
//
// DEC-081 established that surfaces print the BRANCH: ask anybody how many people are in
// Surgery and they mean the wards. It rolled the branch up here, on the client, arguing
// that a total computed over a scope-filtered tree counts exactly the units the reader may
// see (INV-003) while one computed in SQL would count the ones they may not.
//
// The guarantee was right and the location was wrong. A client-side rollup can only SUM
// per-unit scalars, and people do not sum: one nurse holding a post in two wards of the
// same branch is one person in that branch, and Riverside's demo data contains exactly
// that nurse. The server does the walk now (`features/units/service.ts`), over the same
// scope-filtered set it was about to return — so INV-003 is met by the same argument, on
// the side that can also union people rather than add them.
//
// What is still computed here is the UNIT count, and only that, because it is the one
// figure that is exactly "how many boxes are on this screen".
import type { UnitNode } from '@endur/shared';

export type CountedNode = {
  children: CountedNode[];
  peopleCount?: number | undefined;
  subjectCount?: number | undefined;
  peopleTotal?: number | undefined;
  subjectTotal?: number | undefined;
};

/** `units` counts the node itself, so a leaf is 1 and a root is its whole branch. */
export type Totals = { people: number; subjects: number; units: number };

export const NO_TOTALS: Totals = { people: 0, subjects: 0, units: 0 };

/** This unit and everything under it — what the map, the tree and the band print. */
export function branchOf(node: CountedNode): Totals {
  return {
    people: node.peopleTotal ?? 0,
    subjects: node.subjectTotal ?? 0,
    units: countUnits(node),
  };
}

/** This unit alone. Only the detail panel and the map's hover text say it, and both
 *  label it, because an own-count and a branch-count in the same shape is a contradiction
 *  rather than a detail (`32` § What a count on a unit means). */
export function ownOf(node: CountedNode): Totals {
  return { people: node.peopleCount ?? 0, subjects: node.subjectCount ?? 0, units: 1 };
}

const countUnits = (node: CountedNode): number =>
  1 + node.children.reduce((sum, child) => sum + countUnits(child), 0);

/**
 * The forest as one set of numbers, for the band above the map.
 *
 * `meta` is the server's, because summing the roots has the same defect summing children
 * had: a person placed under two roots is one person. `units` is the exception and is
 * counted here — units cannot be in two places, and this way the band agrees with the map
 * even for a reader whose tree was filtered to several disjoint roots.
 */
export function forestTotals(nodes: UnitNode[], meta: Totals | null): Totals {
  const units = nodes.reduce((sum, node) => sum + countUnits(node), 0);
  if (!meta) return { ...NO_TOTALS, units };
  return { people: meta.people, subjects: meta.subjects, units };
}
