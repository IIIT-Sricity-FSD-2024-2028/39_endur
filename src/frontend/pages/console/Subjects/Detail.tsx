// T-034 — /app/subjects/:id. 35 § Interactions, design_specs/design/04 §4.5.
//
// Identity, where it sits, who it is — and then the history: every cycle this subject went
// through and what came back. 35 calls that "the first hint of the Improve layer", and it
// is worth having now even though the loop is P3, because a falling response count across
// three cycles is a story somebody can read straight off the screen.
//
// There are no SCORES here on purpose. Aggregates live behind the results endpoints where
// the k-anonymity gate is (INV-007); an average on this page would be a second path to the
// same numbers with nothing in front of it.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SubjectCycle } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { BarRow } from '../../../components/data/BarRow.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { ApiError } from '../../../lib/api.js';
import { useSubject } from '../../../lib/subjects.js';
import { useUnits } from '../../../lib/units.js';
import { useSubjectList } from '../../../lib/subjects.js';
import { formatDate, formatRelative, pluralise } from '../../../lib/format.js';
import { SubjectForm, type SubjectDraft } from './SubjectForm.js';
import { archiveConsequence } from './index.js';

/**
 * The change between the last two cycles. Two is enough to say "more" or "fewer", and
 * anything cleverer than that would be a chart pretending to be an analysis (43 is P3).
 */
export function trendOf(cycles: SubjectCycle[]): { value: number; valence: 'positive' | 'negative' | 'neutral' } | undefined {
  const done = cycles.filter((cycle) => cycle.responseCount > 0);
  if (done.length < 2) return undefined;
  const latest = done[done.length - 1]?.responseCount ?? 0;
  const before = done[done.length - 2]?.responseCount ?? 0;
  const value = latest - before;
  return { value, valence: value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral' };
}

export default function SubjectDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const labels = useLabels();
  const can = useCan();
  const navigate = useNavigate();
  const subject = useSubject(id);
  const units = useUnits();
  // The list controller is the one place that knows how to write a subject; the detail
  // page borrows its mutations rather than growing a second set (23 §3).
  const writes = useSubjectList({});

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  if (subject.loading && !subject.data) {
    return <div className="card" aria-hidden="true"><div className="tree-skeleton">
      {[0, 1, 2].map((row) => <span key={row} className="skeleton-row wide" />)}
    </div></div>;
  }

  if (!subject.data) {
    return (
      <EmptyState
        icon="subject"
        title="Not found"
        body={
          subject.error instanceof ApiError && subject.error.status === 404
            ? `That ${labels.subject.one.toLowerCase()} does not exist, or it is outside what you can see.`
            : `Could not load that ${labels.subject.one.toLowerCase()}.`
        }
        action={<Link className="btn btn-secondary" to="/app/subjects">Back to {labels.subject.many}</Link>}
      />
    );
  }

  const data = subject.data;
  const busiest = Math.max(1, ...data.cycles.map((cycle) => cycle.responseCount));

  const submit = (draft: SubjectDraft): void => {
    setSaving(true);
    setError(null);
    void writes
      .update(data.id, {
        name: draft.name,
        unitId: draft.unitId,
        // `null` is a real value here — it is how a link is REMOVED, and `undefined` would
        // silently leave it in place.
        linkedUserId: draft.linkedUserId,
      })
      .then(() => {
        setEditing(false);
        return subject.reload();
      })
      .catch((cause: unknown) =>
        setError(cause instanceof ApiError ? cause.message : 'That could not be saved.'),
      )
      .finally(() => setSaving(false));
  };

  return (
    <>
      <PageHeader
        title={data.name}
        subtitle={`${labels.subject.one}${data.unitName ? ` · in ${data.unitName}` : ''}`}
        action={
          <div className="page-actions">
            {can('subject.update') && !data.archivedAt && (
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            {can('subject.archive') && !data.archivedAt && (
              <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={() => setArchiving(true)}>
                Archive
              </button>
            )}
          </div>
        }
      />

      {data.archivedAt && (
        <p className="tag tag-neutral">
          Archived {formatRelative(data.archivedAt)}. It stays out of new{' '}
          {labels.campaign.many.toLowerCase()} and stays in past results.
        </p>
      )}

      <div className="stat-row">
        <StatCard
          kicker="Responses"
          value={data.totalResponses}
          delta={trendOf(data.cycles)}
          context={
            data.lastResponseAt ? `Last ${formatRelative(data.lastResponseAt)}` : 'None yet'
          }
        />
        <StatCard
          kicker={`Active ${labels.campaign.many}`}
          value={data.activeCampaigns}
          context={pluralise(data.cycles.length, 'cycle so far', 'cycles so far')}
        />
        <StatCard
          kicker="Linked person"
          value={data.linkedUserName ?? '—'}
          context={
            data.linkedUserId
              ? `This ${labels.subject.one.toLowerCase()} is a person`
              : `A thing, not a person`
          }
        />
      </div>

      <section className="card cycles-card">
        <h3>History</h3>
        {data.cycles.length === 0 ? (
          <p className="text-meta">
            No {labels.campaign.many.toLowerCase()} have included this{' '}
            {labels.subject.one.toLowerCase()} yet.
          </p>
        ) : (
          <ul className="cycles">
            {data.cycles.map((cycle) => (
              <li key={cycle.campaignId} className="cycle">
                <div className="cycle-head">
                  <Link to={`/app/campaigns/${cycle.campaignId}`}>{cycle.campaignName}</Link>
                  <span className={`tag ${cycle.status === 'open' ? 'tag-good' : 'tag-neutral'}`}>
                    {cycle.status}
                  </span>
                  <span className="text-meta">
                    {cycle.startsAt ? formatDate(cycle.startsAt) : 'Not scheduled'}
                  </span>
                </div>
                <BarRow
                  label="Responses"
                  value={cycle.responseCount}
                  total={busiest}
                  tone="accent"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <SubjectForm
          title={`Edit ${data.name}`}
          verb="Save"
          units={units.data ?? []}
          labels={labels}
          initial={{
            name: data.name,
            unitId: data.unitId ?? '',
            linkedUserId: data.linkedUserId,
            linkedUserName: data.linkedUserName,
          }}
          saving={saving}
          error={error}
          canLinkPeople={can('person.read')}
          onSubmit={submit}
          onCancel={() => { setEditing(false); setError(null); }}
        />
      )}

      {archiving && (
        <ConfirmDialog
          title={`Archive ${data.name}?`}
          consequence={archiveConsequence(data, labels.campaign.many.toLowerCase())}
          verb="Archive"
          destructive
          onConfirm={() => {
            setArchiving(false);
            void writes
              .archive(data.id)
              .then(() => navigate('/app/subjects'))
              .catch((cause: unknown) =>
                setError(cause instanceof ApiError ? cause.message : 'That could not be archived.'),
              );
          }}
          onCancel={() => setArchiving(false)}
        />
      )}
    </>
  );
}
