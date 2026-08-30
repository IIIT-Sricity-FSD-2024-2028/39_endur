// <EnterpriseQueue> — 24, 70 § The Enterprise queue, DEC-100, T-100.
//
// A WORK QUEUE, NOT A FEED, and every decision below follows from that one word.
//
// OLDEST FIRST (the server orders it that way). Every other list on `/ops` answers "what just
// happened"; this one answers "who has been waiting longest", and newest-first is how the
// first customer who asked becomes the last one called.
//
// READING IT CHANGES NOTHING. That is the whole difference between this and the notification
// the owner's instruction first suggested — a bell clears on read, and what has to survive is
// "somebody has to ring this customer back". The row leaves the queue when an operator says
// it has, not when they look at it.
//
// IT DISAPPEARS WHEN IT IS EMPTY. An empty queue on a dashboard is a permanent card that
// teaches the reader to skip that part of the page, and then to skip it on the day it has
// something in it.
//
// STILL INV-011: an organisation's name, a person's name and address, a date, and one note
// they typed. `EnterpriseRequestRow` has no field that could carry anything else.
import { Link } from 'react-router-dom';
import type { EnterpriseRequestRow, EnterpriseStatus } from '@endur/shared';
import { formatRelative } from '../../lib/format.js';
import { Icon } from '../Icon.js';

export function EnterpriseQueue({
  rows,
  busyId,
  onUpdate,
}: {
  rows: readonly EnterpriseRequestRow[];
  busyId: string | null;
  onUpdate: (id: string, status: EnterpriseStatus) => void;
}): JSX.Element | null {
  if (rows.length === 0) return null;

  return (
    <section className="card ops-enterprise" aria-labelledby="enterprise-queue">
      <h3 id="enterprise-queue">
        Asking about Enterprise
        <span className="tab-count">{rows.length}</span>
      </h3>
      <p className="text-muted">
        Oldest first. Reading this changes nothing — mark one contacted when you have rung them.
      </p>

      <ul className="enterprise-list">
        {rows.map((row) => (
          <li className="enterprise-row" key={row.id}>
            <div className="enterprise-who">
              <Link to={`/ops/orgs/${row.org.id}`} className="enterprise-org">{row.org.name}</Link>
              <span className="text-meta">
                {/* WHO TO RING, captured at the time — the row outlives the person's account
                    (`10` §5), so this is a string on the request rather than a join. */}
                {row.askedName} · {row.askedEmail} · on {row.org.tier}
              </span>
              <span className="text-meta">
                <Icon name="plan" size={16} /> asked {formatRelative(row.at)}
              </span>
              {row.note && <p className="enterprise-note">{row.note}</p>}
            </div>

            <div className="enterprise-actions">
              {/* THREE VALUES AND A FREE MOVE BETWEEN THEM (`19` §4). No transition table:
                  the queue is worked by one person and the cost of a wrong click is another
                  click, so machinery guarding it would guard against nothing. */}
              {row.status !== 'contacted' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busyId === row.id}
                  onClick={() => onUpdate(row.id, 'contacted')}
                >
                  Contacted
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busyId === row.id}
                onClick={() => onUpdate(row.id, 'closed')}
              >
                Close
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
