// The right half of /app/structure — design_specs/design/04 §4.2.
//
// The tree answers "what is the shape"; this answers "what is actually in there", which is
// the question somebody asks right before they move or delete something. It is also the
// touch-friendly home for the three row actions, since the row's own icon buttons are
// hover-revealed on a pointer device.
import { Link } from 'react-router-dom';
import type { ResolvedLabels, UnitNode } from '@endur/shared';
import { Icon } from '../../../components/Icon.js';
import { usePeopleIn } from '../../../lib/units.js';
import { pluralise } from '../../../lib/format.js';

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
  const inside = node.children.length;

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
          <dd>{node.peopleCount}</dd>
        </div>
        <div className="unit-stat">
          <dt>{labels.subject.many}</dt>
          <dd>{node.subjectCount}</dd>
        </div>
        <div className="unit-stat">
          <dt>Inside</dt>
          <dd>{inside}</dd>
        </div>
      </dl>

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
          {people.data?.items.length === 0 && !people.loading && (
            <p className="text-meta">Nobody is placed here yet.</p>
          )}
          <ul className="unit-people-list">
            {people.data?.items.map((person) => (
              <li key={person.id}>
                <Link to={`/app/people/${person.id}`}>{person.name}</Link>
                <span className="text-meta">
                  {person.positions[0]?.roleName ?? '—'}
                </span>
              </li>
            ))}
          </ul>
          {node.peopleCount > (people.data?.items.length ?? 0) && (
            <Link className="text-meta" to={`/app/people?unit=${node.id}`}>
              View all {pluralise(node.peopleCount, 'person', 'people')} →
            </Link>
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
