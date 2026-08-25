// `/ops` — the estate list. `70` § Interactions "The estate list — the default view".
//
// Sorted by LAST ACTIVITY, ASCENDING — the quiet organisation is the one support needs.
// The server paginates on `createdAt` (a cursor cannot paginate on an aggregate of another
// table — `service.ts:191`), so THE CLIENT SORTS THE PAGE IT WAS GIVEN. Do not "fix" this
// by changing the cursor; it is a deliberate trade stated in the plan, not a bug.
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ResponsiveTable, type Column } from '../../../components/data/ResponsiveTable.js';
import { OrgRow, orgChips } from '../../../components/platform/OrgRow.js';
import { useEstate, type EstateFilters } from '../../../lib/estate.js';
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

  // The server's page is by `createdAt`; the screen's promise is last-activity-ascending.
  // Sorted here, on the page in hand — never re-requested for it.
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

      <div className="ops-filters">
        <input
          className="input"
          placeholder="Search by name"
          defaultValue={filters.q ?? ''}
          onBlur={(event) => setFilter('q', event.target.value)}
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
