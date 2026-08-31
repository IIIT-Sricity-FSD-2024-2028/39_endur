// The right half of /app/structure — design_specs/design/04 §4.2.
//
// The tree answers "what is the shape"; this answers "what is actually in there", which is
// the question somebody asks right before they move or delete something. It is also the
// touch-friendly home for the three row actions, since the row's own icon buttons are
// hover-revealed on a pointer device.
import type { ResolvedLabels, UnitNode } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { usePeopleIn } from '../../../lib/people.js';
import { useUnitComposition } from '../../../lib/units.js';
import { pluralise } from '../../../lib/format.js';
import { branchOf } from '../../../lib/unitTotals.js';

export function DetailPanel({
  node,
  parentName,
  labels,
  canRename,
  canMove,
  canDelete,
  canReadPeople,
  onRename,
  onMove,
  onDelete,
}: {
  node: UnitNode;
  parentName: string | null;
  labels: ResolvedLabels;
  canRename: boolean;
  canMove: boolean;
  canDelete: boolean;
  canReadPeople: boolean;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}): JSX.Element {
  // Only asked for when the reader may see people at all. A list they cannot have is not
  // rendered empty and apologetic — it is absent (INV-003, design_specs/design/02 §5).
  const people = usePeopleIn(canReadPeople ? node.id : null);
  // WHO the People stat is made of — DEC-083. Asked for whenever the stat is shown, which
  // is not the same gate as the name list below: a breakdown is counts, not identities.
  const composition = useUnitComposition(node.id);
  const inside = node.children.length;

  // The map and the tree print the BRANCH (DEC-081) because a box has room for one number.
  // This panel has room for two, and it is the only surface that shows both — a reader who
  // clicks Surgery after seeing "9 people" on the map is owed the sentence that says three
  // of them are placed on Surgery itself. Without it the two views simply disagree.
  //
  // Both figures are the server's now (DEC-082). "People" here means DISTINCT PEOPLE, not
  // positions: a ward with a Head, a Nurse post held by two and a Patient post held by
  // three used to print "People 3" — the number of role slots — directly above a list of
  // five names, which is what made the panel unreadable rather than merely wrong.
  const branch = branchOf(node);

  return (
    <aside className="unit-detail card" aria-label={`${node.name} details`}>
      <h3 className="unit-detail-name">{node.name}</h3>
      <p className="text-meta unit-detail-where">
        {labels.unit.one}
        {parentName ? ` · in ${parentName}` : ' · top level'}
      </p>

      <dl className="unit-stats">
        <div className="unit-stat">
          <dt>People</dt>
          <dd>
            {branch.people}
            <Split own={node.peopleCount} branch={branch.people} />
          </dd>
        </div>
        <div className="unit-stat">
          <dt>{labels.subject.many}</dt>
          <dd>
            {branch.subjects}
            <Split own={node.subjectCount} branch={branch.subjects} />
          </dd>
        </div>
        <div className="unit-stat">
          <dt>Inside</dt>
          <dd>
            {inside}
            <Split own={inside} branch={branch.units - 1} />
          </dd>
        </div>
      </dl>

      <RoleMix
        rows={composition.data?.byRole ?? []}
        total={composition.data?.total ?? branch.people}
      />

      {node.isTemporary && (
        <p className="text-meta">
          Temporary. Everything inside inherits its end date, so positions expire without
          anyone having to remember to revoke them.
        </p>
      )}

      {canReadPeople && (
        <section className="unit-people">
          <h4 className="section-kicker">People here</h4>
          {people.loading && <p className="text-meta">Loading…</p>}
          {people.error && <p className="text-meta">Could not load people.</p>}
          {people.data?.data.length === 0 && !people.loading && (
            <p className="text-meta">Nobody is placed here yet.</p>
          )}
          <ul className="unit-people-list">
            {people.data?.data.map((person) => (
              <li key={person.id}>
                {/* Names, not links, until /app/people is built. A link to a page that
                    says "Not built yet" reads as a broken product; a name reads as a
                    name (design_specs/design/02 §7). Restore the <Link> with the page. */}
                <span>{person.name}</span>
                <span className="text-meta">
                  {person.positions[0]?.roleName ?? '—'}
                </span>
              </li>
            ))}
          </ul>
          {node.peopleCount > (people.data?.data.length ?? 0) && (
            <p className="text-meta">
              {pluralise(node.peopleCount, 'person', 'people')} here in total.
            </p>
          )}
        </section>
      )}

      <div className="unit-detail-actions">
        {canRename && (
          <button type="button" className="btn btn-secondary" onClick={onRename}>
            Rename
          </button>
        )}
        {canMove && (
          <button type="button" className="btn btn-secondary" onClick={onMove}>
            Move
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={onDelete}>
            <Icon name="delete" size={16} /> Delete
          </button>
        )}
      </div>
    </aside>
  );
}

/**
 * What the People stat is made of — `DEC-083`.
 *
 * The number was honest and unusable: a hospital whose root reads "30 people" means STAFF,
 * and sixteen of those thirty are Patients. The bar is what makes that graspable without
 * reading three figures — "is this mostly patients" is answered by its width, and the count
 * is there for anyone who wants the number.
 *
 * The rows may sum HIGHER than the total, because somebody who is both a Nurse and a Head
 * of Department is honestly in both. The bars are therefore scaled to the LARGEST ROW and
 * never stacked to fill the width — a stacked bar would claim a partition that this is not,
 * and would silently overflow on exactly the org where the claim is wrong.
 */
function RoleMix({
  rows,
  total,
}: {
  rows: Array<{ roleId: string; roleName: string; count: number }>;
  total: number;
}): JSX.Element | null {
  // One role is not a mix — it is the stat above restated, in a taller shape.
  if (rows.length < 2) return null;
  const widest = Math.max(...rows.map((row) => row.count), 1);
  const oversubscribed = rows.reduce((sum, row) => sum + row.count, 0) > total;

  return (
    <section className="unit-mix">
      <h4 className="section-kicker">By role</h4>
      <ol className="unit-mix-rows">
        {rows.map((row) => (
          <li className="unit-mix-row" key={row.roleId}>
            <span className="unit-mix-name">{row.roleName}</span>
            <span className="unit-mix-track">
              <span className="unit-mix-fill" style={{ width: `${(row.count / widest) * 100}%` }} />
            </span>
            <span className="unit-mix-count num">{row.count}</span>
          </li>
        ))}
      </ol>
      {oversubscribed && (
        // Said out loud rather than left to be discovered by adding the column up. Without
        // it the panel looks like it has lost count of its own people.
        <p className="text-meta">
          Somebody holding two roles is counted under both, so these add up past {total}.
        </p>
      )}
    </section>
  );
}

/**
 * "4 here · 60 below", and nothing at all when there is no split to explain.
 *
 * Inside the `<dd>` rather than beside it: `<dl> > <div>` may contain `<dt>` and `<dd>` and
 * nothing else, so a sibling paragraph here would be invalid HTML that happens to render.
 */
function Split({ own, branch }: { own: number; branch: number }): JSX.Element | null {
  if (branch === own) return null;
  return (
    <span className="unit-stat-split">
      {own} here · {branch - own} below
    </span>
  );
}
