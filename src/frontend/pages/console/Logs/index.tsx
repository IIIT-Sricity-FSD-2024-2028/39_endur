// T-076 — /app/logs. 56, design_specs/design/04 §4.
//
// THE ORGANISATION'S OWN RECORD OF WHAT HAPPENED INSIDE IT, AND WHICH RULE ALLOWED IT.
//
// `audit_log` has been written on every state change since `T-013` and had never once been
// read. That is a whole invariant's worth of evidence — INV-007, the transaction-bound row
// carrying `decided_by` — sitting in a table with no reader. This is the reader.
//
// Three things it must keep straight, all of them from `56`:
//
//  1. NO `ip`, EVER. It is not in `AuditEntry` and it is not fetched. `DEC-040` fixed the
//     writer because a fix at the reader protects one screen; this screen is the belt to
//     that brace, and a `response.submit` row here is deliberately the least informative
//     row in the table — the action, the campaign, the time, no actor.
//  2. THE REFUSALS ARE THE POINT (`DEC-041`). *Show refusals only* is a toggle and not a
//     buried dropdown, because it is what turns this page from a business record into a
//     security screen: three refusals of `grant.update` by the same person in a minute is
//     a conversation to have today.
//  3. WHY, NOT ONLY WHAT. Every row carries `<DecisionTrace>` — the same component `42`
//     renders, in the other tense (`24` §6c, INV-009).
//
// No polling and no live tail. This is a record; `72` is the monitor.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { describeCapability } from '@endur/shared';
import type { AuditEntry } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { Toggle } from '../../../components/form/Toggle.js';
import { DecisionTrace } from '../../../components/org/DecisionTrace.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDateTime } from '../../../lib/format.js';
import { useAudit, type AuditFilters } from '../../../lib/audit.js';

const FILTER_KEYS = ['action', 'targetType', 'outcome', 'from', 'to'] as const;

/**
 * The target types a row can carry. Not a catalogue — it is the list `db/tx.ts` actually
 * writes, and the filter offers what exists rather than what might.
 */
const TARGET_TYPES = ['unit', 'person', 'user', 'role', 'subject', 'campaign', 'template', 'organization'];

export default function Logs(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

  // Every filter in the URL. A filtered log is linkable, and *"here is the row I mean"*
  // pasted into a chat is the whole reason anybody opens this page with somebody else.
  const filters: AuditFilters = useMemo(
    () => ({
      action: params.get('action') ?? undefined,
      targetType: params.get('targetType') ?? undefined,
      outcome: params.get('outcome') === 'denied' ? 'denied' : undefined,
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
    }),
    [params],
  );

  const log = useAudit(filters, can('audit.read'));

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    // A filter change re-queries from the top, so an expanded row would be pointing at a
    // row that is no longer on screen.
    setOpenId(null);
  };

  const filtered = FILTER_KEYS.some((key) => params.get(key));

  const header = (
    <PageHeader
      title="Activity log"
      subtitle="What happened in this organisation, and which rule allowed it."
    />
  );

  // 403 — THE ACCOUNT. The sidebar item is absent without `audit.read`, so this is the
  // directly-typed address, and it must not read as an empty log.
  if (!can('audit.read') || log.forbidden) {
    return (
      <div className="page">
        {header}
        <EmptyState
          icon="log"
          title="You do not have access to this"
          body="Your account cannot read the activity log. Whoever administers your organisation can change that."
        />
      </div>
    );
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: 'at',
      header: 'When',
      render: (row) => <span className="text-meta logs-when">{formatDateTime(row.at)}</span>,
    },
    {
      key: 'actor',
      header: 'Who',
      render: (row) =>
        row.actor ? (
          <span className="logs-actor">{row.actor.name}</span>
        ) : (
          // `56` § Anonymity rule 3. A respondent submission names nobody, and saying so
          // out loud is better than an empty cell somebody reads as a bug.
          <span className="text-meta">Not a signed-in person</span>
        ),
    },
    {
      key: 'action',
      header: 'What',
      primary: true,
      render: (row) => (
        <span className="logs-action">
          {/* The SHARED describe(), never a second English mapping — the powers grid and
              this table must not disagree about what `campaign.launch` is called (D-008). */}
          {describeCapability(row.action, labels)}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'On what',
      hideBelow: 'sm',
      render: (row) =>
        row.target ? (
          <span className="logs-target">
            {row.target.name ?? (
              // NEVER hidden. A record that quietly drops the rows whose subjects are gone
              // is a record that can be edited by deleting things (56 § States).
              <span className="text-meta">
                {row.target.id?.slice(0, 8) ?? row.target.type} (deleted)
              </span>
            )}
          </span>
        ) : (
          <span className="text-meta">—</span>
        ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      render: (row) => (
        // Never colour alone (21 §8) — the word is the answer and the tint is decoration.
        <span className={`tag ${row.outcome === 'denied' ? 'tag-bad' : 'tag-good'}`}>
          {row.outcome === 'denied' ? 'Refused' : 'Allowed'}
        </span>
      ),
    },
    {
      key: 'why',
      header: 'Why',
      render: (row) => (
        <div className="logs-why">
          {/* The compact form in the row, the full one when it is expanded — exactly what
              `24` §6c specifies, from one implementation. */}
          <button
            type="button"
            className="logs-expand"
            aria-expanded={openId === row.id}
            onClick={() => setOpenId(openId === row.id ? null : row.id)}
          >
            <DecisionTrace decision={{ decidedBy: row.decidedBy }} compact />
          </button>
          {openId === row.id && (
            <div className="logs-trace">
              <DecisionTrace decision={{ decidedBy: row.decidedBy }} />
              {row.requestId && (
                <p className="text-meta logs-request">Request {row.requestId}</p>
              )}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      {header}

      <div className="logs-controls">
        <Toggle
          checked={filters.outcome === 'denied'}
          onChange={(on) => setFilter('outcome', on ? 'denied' : '')}
          label="Show refusals only"
          hint="Who has been trying things they cannot do"
        />

        <div className="logs-filters">
          <label className="field-inline">
            <span className="text-meta">On what</span>
            <select
              value={filters.targetType ?? ''}
              onChange={(event) => setFilter('targetType', event.target.value)}
            >
              <option value="">Anything</option>
              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="field-inline">
            <span className="text-meta">From</span>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => setFilter('from', event.target.value)}
            />
          </label>

          <label className="field-inline">
            <span className="text-meta">To</span>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => setFilter('to', event.target.value)}
            />
          </label>
        </div>
      </div>

      {/* Inline, above the table, and the last good page stays on screen (56 § States). */}
      {log.error && (
        <p className="form-error" role="alert">
          That did not load. {log.error.message}
        </p>
      )}

      {log.loading && log.rows.length === 0 ? (
        <div className="logs-skeleton" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="skeleton-row" />
          ))}
        </div>
      ) : (
        <ResponsiveTable
          caption="Activity log"
          columns={columns}
          rows={log.rows}
          rowKey={(row) => row.id}
          empty={
            filtered ? (
              // Different copy AND a way out, because the two empties mean opposite things
              // — one is "nothing happened", the other is "your filter is too narrow" (34).
              <EmptyState
                icon="log"
                title="Nothing matches those filters"
                body="Widen the range, or clear them and start again."
                action={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setParams(new URLSearchParams(), { replace: true });
                      setOpenId(null);
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon="log"
                title="Nothing has been recorded yet"
                body="Every change made in this organisation appears here, with the rule that allowed it."
              />
            )
          }
        />
      )}

      {log.data?.page.hasMore && (
        <div className="logs-more">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void log.loadMore()}
            disabled={log.loadingMore}
          >
            {log.loadingMore ? 'Loading…' : 'Load older'}
          </button>
          <p className="text-meta">
            Showing {log.rows.length} of {log.data.meta.total}
          </p>
        </div>
      )}
    </div>
  );
}
