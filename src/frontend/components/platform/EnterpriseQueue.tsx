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
  error,
  onUpdate,
  onApprove,
}: {
  rows: readonly EnterpriseRequestRow[];
  busyId: string | null;
  /** A refused write, rendered. It used to be swallowed — see `useEnterpriseQueue`. */
  error: string | null;
  onUpdate: (id: string, status: EnterpriseStatus) => void;
  onApprove: (id: string) => void;
}): JSX.Element | null {
  // The card still disappears when there is nothing outstanding AND nothing went wrong. An
  // error with no rows behind it must still render, or a failed load looks like an empty queue.
  if (rows.length === 0 && !error) return null;

  return (
    <section className="card ops-enterprise" aria-labelledby="enterprise-queue">
      <h3 id="enterprise-queue">
        Asking about Enterprise
        <span className="tab-count">{rows.length}</span>
      </h3>
      <p className="text-muted">
        Oldest first. Reading this changes nothing. <strong>Approve</strong> puts them on
        Enterprise and records the ₹4,999 — <strong>Contacted</strong> only notes that you rang.
      </p>

      {/* NEVER SWALLOWED. A 403 or a 409 here used to produce an unhandled rejection and
          nothing on screen, which is how "clicking Contacted does nothing" happened. */}
      {error && <p className="form-error" role="alert">{error}</p>}

      <ul className="enterprise-list">
        {rows.map((row) => (
          <li className="enterprise-row" key={row.id}>
            <div className="enterprise-who">
              <span className="enterprise-title">
                <Link to={`/ops/orgs/${row.org.id}`} className="enterprise-org">{row.org.name}</Link>
                {/* PROGRESS, VISIBLE. Without this the Contacted button changed a column
                    nobody could see, which is indistinguishable from a button that failed. */}
                {row.status === 'contacted' && <span className="tag tag-muted">Contacted</span>}
              </span>
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
              {/* THE VERB THAT MAKES THE MONEY — DEC-111. Before this the queue could only
                  record a conversation: the owner closed the request, went to the org's page
                  and set the tier by hand, and `overridePlan` writes NO ledger row — so the
                  one tier the product charges ₹4,999 for earned NOTHING, and every Enterprise
                  customer was invisible to /ops/earnings.
                  It names no amount. The price comes from PLAN_OPTIONS server-side, exactly as
                  it does on a customer's own join, which is why this does not reopen the
                  "an operator could invent revenue" objection that keeps an amount off
                  `OverridePlan`. */}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busyId === row.id}
                onClick={() => onApprove(row.id)}
              >
                Approve
              </button>
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
