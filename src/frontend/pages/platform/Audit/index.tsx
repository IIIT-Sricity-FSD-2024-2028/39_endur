// `/ops/audit`: the platform's OWN audit trail, every operator action, newest first
// (`platform.audit.read`, both roles). R-716.
//
// The filters are `state.opsReports.audit`; the entries are RTK Query's cache
// (`getPlatformAudit`, one cached list per filter); what each entry SAYS (its words, the
// one-line summary of what it changed, its colour) and the per-action counts are
// `selectAuditView` (store/screens/opsReports.ts). Every write on `/ops` invalidates the
// trail's tag, so an action taken elsewhere is here when this page is next shown.
import { Link } from 'react-router-dom';
import { Denied, Empty, OpsError, OpsHeader, Pill } from '../../../components/platform/OpsUi.js';
import { formatDateTime, formatRelative } from '../../../lib/format.js';
import { usePlatformAudit } from '../../../lib/opsRegisters.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import {
  AUDIT_ACTIONS,
  auditFilterChanged,
  selectAuditFilters,
  selectAuditSearch,
  selectAuditView,
} from '../../../store/screens/opsReports.js';

export default function Audit(): JSX.Element {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(selectAuditFilters);
  const search = useAppSelector(selectAuditSearch);
  const trail = usePlatformAudit(search);
  const view = useAppSelector(selectAuditView);

  if (trail.forbidden) {
    return <Denied capability="platform.audit.read" what="The audit trail" />;
  }

  const filtered = filters.action !== null || filters.orgId !== null;

  return (
    <>
      <OpsHeader
        kicker="Platform"
        title="Audit trail"
        subtitle="Every action an operator has taken on the platform, newest first. Ours, not a customer's."
      />

      <section className="ops-card card" aria-labelledby="trail">
        <div className="ops-card-head">
          <h2 id="trail">Actions</h2>
          <p className="ops-card-note">
            {view.rows.length.toLocaleString()} shown of {view.total.toLocaleString()}
            {filtered ? ' matching' : ''}
          </p>
        </div>

        <div className="ops-toolbar">
          <select
            className="input"
            aria-label="Action"
            value={filters.action ?? ''}
            onChange={(event) => dispatch(auditFilterChanged({ action: event.target.value }))}
          >
            <option value="">Every action</option>
            {Object.entries(AUDIT_ACTIONS).map(([action, label]) => (
              <option key={action} value={action}>{label}</option>
            ))}
          </select>
          {filters.orgId && (
            <span className="ops-pills">
              <Pill tone="accent">Organization: {filters.orgName ?? 'one organization'}</Pill>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => dispatch(auditFilterChanged({ orgId: '' }))}
              >
                Every organization
              </button>
            </span>
          )}
          {filters.action && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch(auditFilterChanged({ action: '' }))}>
              Every action
            </button>
          )}
        </div>

        {view.byAction.length > 1 && (
          <p className="ops-pills" aria-label="Loaded actions by kind">
            {view.byAction.map((entry) => (
              <Pill key={entry.action}>{entry.count} · {entry.label.toLowerCase()}</Pill>
            ))}
          </p>
        )}

        {trail.error && <OpsError>{trail.error.message}</OpsError>}

        <div className={trail.loading ? 'ops-loading' : undefined}>
          {view.rows.length === 0 && !trail.loading ? (
            <Empty title={filtered ? 'Nothing matches those filters' : 'No operator has done anything yet'} />
          ) : (
            <ul className="ops-timeline">
              {view.rows.map((row) => (
                <li key={row.id}>
                  <span className={`ops-dot is-${row.tone}`} aria-hidden="true" />
                  <div>
                    <div className="ops-timeline-head">
                      <strong>{row.label}</strong>
                      {row.org && (
                        <Link className="ops-link" to={`/ops/orgs/${row.org.id}`}>{row.org.name}</Link>
                      )}
                      <span className="text-meta">by {row.actor?.name ?? 'a removed operator'}</span>
                      <span className="ops-timeline-when" title={formatDateTime(row.at)}>{formatRelative(row.at)}</span>
                    </div>
                    {row.summary && <p className="ops-timeline-body">{row.summary}</p>}
                    {row.requestId && <p className="ops-how">Request {row.requestId}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {view.hasMore && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={trail.loadingMore}
            onClick={() => void trail.loadMore()}
          >
            {trail.loadingMore ? 'Loading…' : 'Load older'}
          </button>
        )}
      </section>
    </>
  );
}
