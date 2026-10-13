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
  const people = usePeopleIn(canReadPeople ? node.id : null);
  const composition = useUnitComposition(node.id);
  const inside = node.children.length;

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

function RoleMix({
  rows,
  total,
}: {
  rows: Array<{ roleId: string; roleName: string; count: number }>;
  total: number;
}): JSX.Element | null {
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
        <p className="text-meta">
          Somebody holding two roles is counted under both, so these add up past {total}.
        </p>
      )}
    </section>
  );
}

function Split({ own, branch }: { own: number; branch: number }): JSX.Element | null {
  if (branch === own) return null;
  return (
    <span className="unit-stat-split">
      {own} here · {branch - own} below
    </span>
  );
}
