import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { OrgRow, orgChips } from '../../../components/platform/OrgRow.js';
import { useEnterpriseQueue, useEstate, type EstateFilters } from '../../../lib/estate.js';
import { EnterpriseQueue } from '../../../components/platform/EnterpriseQueue.js';
import { useOpsCan } from '../../../lib/opsCapabilities.js';
import type { PlatformOrgSummary } from '@endur/shared';

function readFilters(params: URLSearchParams): EstateFilters {
  return {
    tier: params.get('tier') ?? undefined,
    status: params.get('status') ?? undefined,
    industry: params.get('industry') ?? undefined,
    q: params.get('q') ?? undefined,
  };
}

export default function Console(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = readFilters(params);
  const estate = useEstate(filters);
  const can = useOpsCan();
  const queue = useEnterpriseQueue(can('platform.enterprise.read'));
  const [queueBusy, setQueueBusy] = useState<string | null>(null);
  // The search box's text, held here so the input is controlled like every other filter. It
  // reaches the URL (and the request) on Enter or when the box loses focus, not per keystroke.
  const [term, setTerm] = useState(filters.q ?? '');

  const sorted = useMemo(() => {
    const rows = [...estate.rows];
    rows.sort((a, b) => {
      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : -Infinity;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : -Infinity;
      return aTime - bTime;
    });
    return rows;
  }, [estate.rows]);

  const columns: Column<PlatformOrgSummary>[] = [
    {
      key: 'org',
      header: 'Organization',
      primary: true,
      render: (org) => <OrgRow org={org} onOpen={(id) => navigate(`/ops/orgs/${id}`)} chips={orgChips(org)} />,
    },
  ];

  const setFilter = (key: keyof EstateFilters, value: string): void => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  if (estate.forbidden) {
    return (
      <div className="fullpage">
        <div>
          <h3>You do not have access to this</h3>
          <p className="text-muted">Your operator account cannot open the estate list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Organizations"
        subtitle="Every organisation on the platform, as numbers."
        vocabulary={false}
      />

      {/* ABOVE THE ESTATE LIST, because it is the one thing on this page that is WAITING on
          somebody. The list below is a reference; this is a to-do. It renders nothing at all
          when the queue is empty — an always-present empty card is one the reader learns to
          skip, including on the day it is not empty. */}
      <EnterpriseQueue
        rows={queue.rows}
        busyId={queueBusy}
        error={queue.error}
        onUpdate={(id, status) => {
          setQueueBusy(id);
          void queue.update(id, status).finally(() => setQueueBusy(null));
        }}
        onApprove={(id) => {
          setQueueBusy(id);
          void queue.approve(id).finally(() => setQueueBusy(null));
        }}
      />

      <div className="ops-filters">
        <input
          className="input"
          placeholder="Search by name"
          aria-label="Search organisations by name"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onBlur={() => setFilter('q', term.trim())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setFilter('q', term.trim());
          }}
        />
        <select className="input" value={filters.tier ?? ''} onChange={(event) => setFilter('tier', event.target.value)}>
          <option value="">Any tier</option>
          <option value="bronze">Bronze</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select
          className="input"
          value={filters.status ?? ''}
          onChange={(event) => setFilter('status', event.target.value)}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="none">None</option>
        </select>
      </div>

      {estate.error && (
        <p className="field-error" role="alert">
          {estate.error.message}
          {/* The one person who can go straight to error-*.log (`18` §6). */}
          {'requestId' in estate.error && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void navigator.clipboard.writeText(
                  String((estate.error as { requestId?: string }).requestId),
                );
              }}
            >
              Copy request id
            </button>
          )}
        </p>
      )}

      <div className={estate.loading ? 'is-dimmed' : undefined}>
        <ResponsiveTable
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.id}
          caption="Organizations"
          empty={
            <EmptyState
              icon="organization"
              title="No organisations match those filters"
              body="Try clearing a filter, or check back once the estate has grown."
            />
          }
        />
      </div>

      {estate.data?.page.hasMore && (
        <button type="button" className="btn btn-secondary" onClick={() => void estate.loadMore()} disabled={estate.loadingMore}>
          {estate.loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
