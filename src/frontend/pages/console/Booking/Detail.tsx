// T-095 — /app/booking/:id. The slot editor, the bookings table, and the QR code.
//
// THE SLOT EDITOR REPLACES THE WHOLE SET, because the API does (`PUT /bookables/:id/slots`,
// the same shape `PUT /templates/:id/questions` takes). A partial patch protocol would need
// both sides to agree about a diff, and the set is small enough to send whole.
//
// SLOTS WITH BOOKINGS ON THEM CANNOT BE EDITED AWAY, and the server refuses with 409 rather
// than cascading. This page says so before the press instead of only afterwards: the person
// whose appointment would vanish is not in the room to object.
//
// The QR is <ShareSheet>, the same component the campaign detail page uses. One QR
// implementation in the product — a second one is a second thing to get wrong at 280px on a
// projector (`24` § ShareSheet, N-004).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SlotInput } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { ResponsiveTable } from '../../../components/data/ResponsiveTable.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { SlotGrid } from '../../../components/data/SlotGrid.js';
import { ApiError } from '../../../lib/api.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDateTime } from '../../../lib/format.js';
import {
  cancelBooking,
  closeBookable,
  deleteBookable,
  openBookable,
  openKey,
  putSlots,
  useBookable,
} from '../../../lib/booking.js';

/** A local, editable slot. `id` is present only for the ones the server already knows. */
type Draft = { id: string; startsAt: string; endsAt: string; capacity: number; remaining: number };

/** `2026-08-30T14:00` — what `<input type="datetime-local">` reads and writes. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** The next round hour, so adding a slot never starts by fixing a date somebody did not pick. */
function nextHour(after?: string): Date {
  const base = after ? new Date(after) : new Date();
  const next = new Date(base.getTime() + 60 * 60 * 1000);
  next.setMinutes(0, 0, 0);
  return next;
}

export default function BookingDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const { bookable, bookings, loading, forbidden, upgrade, reload } = useBookable(id);

  const canUpdate = can('booking.update');
  const canDelete = can('booking.delete');
  const canCancel = can('booking.cancel');

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cancelling, setCancelling] = useState<{ id: string; name: string } | null>(null);

  // The server's slots are the source of truth; the drafts are a copy somebody is editing.
  // Re-seeded whenever the server answers, and NOT while `dirty`, so a reload triggered by
  // some other action cannot silently discard half-typed times.
  useEffect(() => {
    if (!bookable || dirty) return;
    setDrafts(
      bookable.slots.map((slot) => ({
        id: slot.id,
        startsAt: toLocalInput(slot.startsAt),
        endsAt: toLocalInput(slot.endsAt),
        capacity: slot.capacity,
        remaining: slot.remaining,
      })),
    );
  }, [bookable, dirty]);

  const live = useMemo(() => bookings.filter((booking) => booking.cancelledAt === null), [bookings]);
  const anyBooked = live.length > 0;

  if (forbidden) {
    return (
      <>
        <PageHeader title="Booking" />
        <EmptyState
          icon="booking"
          title="Not yours to read"
          body="You do not have permission to see this. An administrator can grant it."
        />
      </>
    );
  }

  if (upgrade) {
    return (
      <>
        <PageHeader title="Booking" />
        <EmptyState
          icon="booking"
          title="Booking is part of Gold"
          body="Publish times, let people take them from a code, and let the server keep two phones from taking the last one."
          action={
            <Link className="btn btn-primary" to="/app/plan">
              See the plan
            </Link>
          }
        />
      </>
    );
  }

  if (!bookable) {
    return (
      <>
        <PageHeader title="Booking" />
        {!loading && (
          <EmptyState
            icon="booking"
            title="Not found"
            body="That bookable does not exist, or it belongs to somebody else."
          />
        )}
      </>
    );
  }

  const act = (work: Promise<unknown>): void => {
    setBusy(true);
    setError(null);
    void work
      .then(() => {
        setDirty(false);
        return reload();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : 'That did not work.');
      })
      .finally(() => setBusy(false));
  };

  const edit = (index: number, patch: Partial<Draft>): void => {
    setDirty(true);
    setDrafts((current) =>
      current.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)),
    );
  };

  const addSlot = (): void => {
    const last = drafts[drafts.length - 1];
    const start = nextHour(last ? last.endsAt : undefined);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setDirty(true);
    setDrafts((current) => [
      ...current,
      {
        id: `new-${current.length}-${start.getTime()}`,
        startsAt: toLocalInput(start.toISOString()),
        endsAt: toLocalInput(end.toISOString()),
        capacity: 1,
        remaining: 1,
      },
    ]);
  };

  const save = (): void => {
    if (!id) return;
    const slots: SlotInput[] = drafts.map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt),
      capacity: slot.capacity,
    }));
    act(putSlots(id, { slots }));
  };

  return (
    <>
      <PageHeader
        title={bookable.name}
        subtitle={bookable.description ?? undefined}
        action={
          <>
            {bookable.url && (
              <button type="button" className="btn btn-secondary" onClick={() => setSharing(true)}>
                Share
              </button>
            )}
            {canUpdate && !bookable.publicToken && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || drafts.length === 0 || dirty}
                // Idempotent: this mints the public token, and a double-click on stage must
                // not produce two links.
                onClick={() => id && act(openBookable(id, openKey(id)))}
              >
                Open for booking
              </button>
            )}
            {canUpdate && bookable.publicToken && !bookable.closedAt && (
              <button type="button" className="btn btn-secondary" onClick={() => setClosing(true)}>
                Close
              </button>
            )}
          </>
        }
      />

      {error && (
        <p className="text-meta form-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2 className="section-title">Times</h2>
        {anyBooked && canUpdate && (
          // Said BEFORE the press. The 409 is the real enforcement; this is so nobody
          // reaches it by surprise.
          <p className="text-meta">
            Somebody has booked here, so the times are locked. Cancel those bookings first if
            you need to change them.
          </p>
        )}

        {canUpdate && !anyBooked ? (
          <>
            <ul className="slot-editor" role="list">
              {drafts.map((slot, index) => (
                <li key={slot.id} className="slot-editor-row">
                  <label className="field">
                    <span className="field-label">Starts</span>
                    <input
                      className="input"
                      type="datetime-local"
                      value={slot.startsAt}
                      onChange={(event) => edit(index, { startsAt: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Ends</span>
                    <input
                      className="input"
                      type="datetime-local"
                      value={slot.endsAt}
                      onChange={(event) => edit(index, { endsAt: event.target.value })}
                    />
                  </label>
                  <label className="field field-narrow">
                    <span className="field-label">Places</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={100}
                      value={slot.capacity}
                      onChange={(event) =>
                        edit(index, { capacity: Math.max(1, Number(event.target.value) || 1) })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setDirty(true);
                      setDrafts((current) => current.filter((_row, position) => position !== index));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="slot-editor-actions">
              <button type="button" className="btn btn-secondary" onClick={addSlot}>
                Add a time
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !dirty}
                onClick={save}
              >
                Save times
              </button>
            </div>
          </>
        ) : (
          // Read-only: no `onSelect`, no `onRemove`. The same grid the picker draws, which
          // is the whole reason it is one component.
          <SlotGrid slots={bookable.slots} />
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Who has booked</h2>
        {/* THE ONE PLACE IN THIS FEATURE THAT PRINTS NAMES, and it is deliberate: a booking
            is identified because it has to be honoured (DEC-090). The public payload carries
            none of this, so the link a guest holds never becomes a roster. */}
        <ResponsiveTable
          caption="Bookings"
          rows={bookings}
          rowKey={(booking) => booking.id}
          empty={<p className="text-muted">Nobody has booked yet.</p>}
          columns={[
            {
              key: 'when',
              header: 'Time',
              primary: true,
              render: (booking) => formatDateTime(booking.startsAt),
            },
            { key: 'name', header: 'Name', render: (booking) => booking.name },
            { key: 'email', header: 'Email', hideBelow: 'sm', render: (booking) => booking.email },
            {
              key: 'state',
              header: '',
              render: (booking) =>
                booking.cancelledAt ? (
                  <span className="tag tag-muted">Cancelled</span>
                ) : canCancel ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setCancelling({ id: booking.id, name: booking.name })}
                  >
                    Cancel
                  </button>
                ) : null,
            },
          ]}
        />
      </section>

      {canDelete && (
        <section className="card danger-zone">
          <h2 className="section-title">Delete</h2>
          <p className="text-meta">
            This removes the times and every booking on them, including the ones people are
            expecting to be honoured.
          </p>
          <button type="button" className="btn btn-danger" onClick={() => setRemoving(true)}>
            Delete this
          </button>
        </section>
      )}

      {sharing && bookable.url && (
        <ShareSheet
          url={bookable.url}
          campaignName={bookable.name}
          status={bookable.closedAt ? 'closed' : 'open'}
          onClose={() => setSharing(false)}
        />
      )}

      {closing && (
        <ConfirmDialog
          title={`Close ${bookable.name}?`}
          consequence="The link stops working. Every booking already taken stays exactly as it is."
          verb="Close"
          onConfirm={() => {
            setClosing(false);
            if (id) act(closeBookable(id));
          }}
          onCancel={() => setClosing(false)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Delete ${bookable.name}?`}
          consequence={`This deletes ${live.length} booking${live.length === 1 ? '' : 's'} people are expecting. It cannot be undone.`}
          verb="Delete"
          destructive
          onConfirm={() => {
            setRemoving(false);
            if (!id) return;
            setBusy(true);
            void deleteBookable(id)
              .then(() => navigate('/app/booking'))
              .catch(() => setError('That did not work.'))
              .finally(() => setBusy(false));
          }}
          onCancel={() => setRemoving(false)}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title={`Cancel ${cancelling.name}'s booking?`}
          // `booking.cancel` exists as its own verb precisely because this reaches into a
          // decision somebody else made, so the dialog says whose.
          consequence="The place goes back into the slot straight away. Nobody is told — there is no mail transport in this product."
          verb="Cancel it"
          destructive
          onConfirm={() => {
            const target = cancelling.id;
            setCancelling(null);
            act(cancelBooking(target));
          }}
          onCancel={() => setCancelling(null)}
        />
      )}
    </>
  );
}
