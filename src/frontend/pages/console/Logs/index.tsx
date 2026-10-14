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

const TARGET_TYPES = ['unit', 'person', 'user', 'role', 'subject', 'campaign', 'template', 'organization'];

export default function Logs(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);

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
    setOpenId(null);
  };

  const filtered = FILTER_KEYS.some((key) => params.get(key));

  const header = (
    <PageHeader
      title="Activity log"
      subtitle="What happened in this organisation, and which rule allowed it."
    />
  );

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
