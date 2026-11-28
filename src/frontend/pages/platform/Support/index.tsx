// `/ops/support`: the register of support visits, who entered which organisation, why, and
// when they left (`platform.support.read`, both roles; DEC-114). R-716.
//
// One request for the whole register (the server keeps the latest 200). Which part of it is
// shown is `state.opsReports.support.show`, and the filtering, the counts on the switch, each
// visit's status and length, and the average are all `selectSupportView`
// (store/screens/opsReports.ts): switching between "Open now" and "Over" asks the server
// nothing.
import { Link } from 'react-router-dom';
import { Denied, Empty, Kpi, OpsError, OpsHeader, Pill } from '../../../components/platform/OpsUi.js';
import { formatDateTime, formatRelative } from '../../../lib/format.js';
import { useSupportSessions } from '../../../lib/opsRegisters.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import {
  selectSupportShow,
  selectSupportView,
  supportSearch,
  supportShown,
  type SupportShow,
  type SupportStatus,
} from '../../../store/screens/opsReports.js';

const SEARCH = supportSearch();

const STATUS: Record<SupportStatus, { label: string; tone: 'good' | undefined }> = {
  active: { label: 'Open now', tone: 'good' },
  left: { label: 'Left', tone: undefined },
  expired: { label: 'Ran out', tone: undefined },
};

const SHOW: Array<{ value: SupportShow; label: string; count: 'all' | 'active' | 'over' }> = [
  { value: 'all', label: 'All', count: 'all' },
  { value: 'active', label: 'Open now', count: 'active' },
  { value: 'over', label: 'Over', count: 'over' },
];

export default function Support(): JSX.Element {
  const dispatch = useAppDispatch();
  const register = useSupportSessions(SEARCH);
  const show = useAppSelector(selectSupportShow);
  const view = useAppSelector((state) => selectSupportView(state, SEARCH));

  if (register.forbidden) {
    return <Denied capability="platform.support.read" what="The support register" />;
  }

  return (
    <>
      <OpsHeader
        kicker="Estate"
        title="Support visits"
        subtitle="Every time somebody from Endur entered a customer's console: who, where, why, and for how long."
      />

      <section className="ops-kpis" aria-label="The register in numbers">
        <Kpi icon="support" label="Open now" tone={view.counts.active > 0 ? 'good' : undefined} value={view.counts.active} detail="Sessions that have not ended or run out" />
        <Kpi icon="activity" label="Visits" value={view.counts.all} detail={`to ${view.orgs} organization${view.orgs === 1 ? '' : 's'}, by ${view.operators} operator${view.operators === 1 ? '' : 's'}`} />
        <Kpi
          icon="countdown"
          label="Average visit"
          value={view.averageMinutes === null ? '—' : `${view.averageMinutes} min`}
          detail={view.averageMinutes === null ? 'No visit has finished yet' : `over ${view.counts.over} finished visit${view.counts.over === 1 ? '' : 's'}`}
        />
      </section>

      <section className="ops-card card" aria-labelledby="register">
        <div className="ops-card-head">
          <h2 id="register">The register</h2>
          <div className="ops-segmented" role="group" aria-label="Show">
            {SHOW.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={show === option.value}
                onClick={() => dispatch(supportShown({ show: option.value }))}
              >
                {option.label}
                <span className="ops-count">{view.counts[option.count]}</span>
              </button>
            ))}
          </div>
        </div>

        {register.error && <OpsError>{register.error.message}</OpsError>}

        <div className={`ops-table-wrap${register.loading ? ' ops-loading' : ''}`}>
          {view.rows.length === 0 && !register.loading ? (
            <Empty title={show === 'active' ? 'Nobody is inside a customer’s console right now.' : 'No support visits yet.'} />
          ) : (
            <table className="ops-table">
              <caption className="sr-only">Support visits</caption>
              <thead>
                <tr>
                  <th scope="col">Organization</th>
                  <th scope="col">Operator</th>
                  <th scope="col">Why</th>
                  <th scope="col">Started</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="is-num">Length</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id}>
                    <td><Link className="ops-link" to={`/ops/orgs/${row.org.id}`}>{row.org.name}</Link></td>
                    <td>
                      <div className="ops-table-org">
                        <strong>{row.operator.name}</strong>
                        <span>{row.operator.email}</span>
                      </div>
                    </td>
                    <td>“{row.reason}”</td>
                    <td className="is-muted" title={formatDateTime(row.startedAt)}>{formatRelative(row.startedAt)}</td>
                    <td><Pill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Pill></td>
                    <td className="is-num">
                      {row.minutes === null ? `until ${formatDateTime(row.expiresAt)}` : `${row.minutes} min`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
