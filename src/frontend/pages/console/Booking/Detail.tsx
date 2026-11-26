// `/app/booking/:id`: one bookable. It and its bookings are RTK Query reads; its drafts, its
// dialogs and every write are `state.booking.pages[id]` (store/screens/booking.ts).
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { ResponsiveTable } from '../../../components/data/ResponsiveTable.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { SlotGrid } from '../../../components/data/SlotGrid.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDateTime } from '../../../lib/format.js';
import { useBookable } from '../../../lib/booking.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  attendeeBookingCancelled,
  attendeeCancelAsked,
  bookableClosed,
  bookableDeleted,
  bookableLeft,
  bookableOpened,
  bookingConfirmClosed,
  bookingConfirmOpened,
  bookingShareClosed,
  bookingShareOpened,
  detailsDiscarded,
  detailsEdited,
  detailsOf,
  detailsSaved,
  selectBookingPage,
  slotAdded,
  slotDraftsOf,
  slotEdited,
  slotRemoved,
  slotsSaved,
  type SlotDraft,
} from '../../../store/screens/booking.js';

export default function BookingDetail(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const dispatch = useAppDispatch();
  const { bookable, bookings, loading, forbidden, upgrade } = useBookable(id);
  const page = useAppSelector((state) => selectBookingPage(state, id));
  useClearOnLeave(bookableLeft({ id }));

  const canUpdate = can('booking.update');
  const canDelete = can('booking.delete');
  const canCancel = can('booking.cancel');

  const { busy, sharing, confirming, cancelling } = page;
  const error = messageOf(page.error, 'That did not work.');

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
          // The way to the plan page for whoever may change the plan; nobody else gets a
          // button to a page they cannot use (as <UpgradeCard> does).
          {...(can('billing.update')
            ? { action: <Link className="btn btn-primary" to="/app/plan">See the plan</Link> }
            : {})}
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

  // What the editors show: the draft once somebody has edited, the server's copy until then.
  const shown: SlotDraft[] = page.slots ?? slotDraftsOf(bookable);
  const dirty = page.slots !== null;
  const details = page.details ?? detailsOf(bookable);
  const detailsDirty = page.details !== null;

  const edit = (index: number, patch: Partial<SlotDraft>): void => {
    dispatch(slotEdited({ id, index, patch, from: shown }));
  };

  return (
    <>
      <PageHeader
        title={bookable.name}
        subtitle={bookable.description ?? undefined}
        action={
          <>
            {bookable.url && (
              <button type="button" className="btn btn-secondary" onClick={() => dispatch(bookingShareOpened({ id }))}>
                Share
              </button>
            )}
            {canUpdate && !bookable.publicToken && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || shown.length === 0 || dirty}
                onClick={() => void dispatch(bookableOpened(id))}
              >
                Open for booking
              </button>
            )}
            {canUpdate && bookable.publicToken && !bookable.closedAt && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => dispatch(bookingConfirmOpened({ id, what: 'close' }))}
              >
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

      {canUpdate && (
        <section className="card booking-panel">
          <h2 className="section-title">Details</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void dispatch(detailsSaved(id));
            }}
          >
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={details.name}
                maxLength={140}
                onChange={(event) =>
                  dispatch(detailsEdited({ id, patch: { name: event.target.value }, from: details }))}
              />
            </label>
            <label className="field">
              <span className="field-label">Description (optional)</span>
              <textarea
                className="input"
                rows={2}
                maxLength={2000}
                value={details.description}
                onChange={(event) =>
                  dispatch(detailsEdited({ id, patch: { description: event.target.value }, from: details }))}
              />
            </label>
            <div className="slot-editor-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || !detailsDirty}
                onClick={() => dispatch(detailsDiscarded({ id }))}
              >
                Discard
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !detailsDirty || details.name.trim() === ''}
              >
                Save details
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card booking-panel">
        <h2 className="section-title">Times</h2>
        {anyBooked && canUpdate && (
          <p className="text-meta">
            Somebody has booked here, so the times are locked. Cancel those bookings first if
            you need to change them.
          </p>
        )}

        {canUpdate && !anyBooked ? (
          <>
            <ul className="slot-editor" role="list">
              {shown.map((slot, index) => (
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
                    onClick={() => dispatch(slotRemoved({ id, index, from: shown }))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="slot-editor-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => dispatch(slotAdded({ id, from: shown }))}
              >
                Add a time
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !dirty}
                onClick={() => void dispatch(slotsSaved(id))}
              >
                Save times
              </button>
            </div>
          </>
        ) : (
          <SlotGrid slots={bookable.slots} />
        )}
      </section>

      <section className="card booking-panel">
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
                    disabled={busy}
                    onClick={() =>
                      dispatch(attendeeCancelAsked({ id, booking: { id: booking.id, name: booking.name } }))}
                  >
                    Cancel
                  </button>
                ) : null,
            },
          ]}
        />
      </section>

      {canDelete && (
        <section className="card booking-panel danger-zone">
          <h2 className="section-title">Delete</h2>
          <p className="text-meta">
            This removes the times and every booking on them, including the ones people are
            expecting to be honoured.
          </p>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => dispatch(bookingConfirmOpened({ id, what: 'delete' }))}
          >
            Delete this
          </button>
        </section>
      )}

      {sharing && bookable.url && (
        <ShareSheet
          url={bookable.url}
          campaignName={bookable.name}
          status={bookable.closedAt ? 'closed' : 'open'}
          onClose={() => dispatch(bookingShareClosed({ id }))}
        />
      )}

      {confirming === 'close' && (
        <ConfirmDialog
          title={`Close ${bookable.name}?`}
          consequence="The link stops working. Every booking already taken stays exactly as it is."
          verb="Close"
          onConfirm={() => void dispatch(bookableClosed(id))}
          onCancel={() => dispatch(bookingConfirmClosed({ id }))}
        />
      )}

      {confirming === 'delete' && (
        <ConfirmDialog
          title={`Delete ${bookable.name}?`}
          consequence={`This deletes ${live.length} booking${live.length === 1 ? '' : 's'} people are expecting. It cannot be undone.`}
          verb="Delete"
          destructive
          onConfirm={() => {
            void dispatch(bookableDeleted(id)).then((result) => {
              if (bookableDeleted.fulfilled.match(result)) navigate('/app/booking');
            });
          }}
          onCancel={() => dispatch(bookingConfirmClosed({ id }))}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title={`Cancel ${cancelling.name}'s booking?`}
          consequence="The place goes back into the slot straight away. Nobody is told — there is no mail transport in this product."
          verb="Cancel it"
          destructive
          onConfirm={() =>
            void dispatch(attendeeBookingCancelled({ bookableId: id, bookingId: cancelling.id }))}
          onCancel={() => dispatch(bookingConfirmClosed({ id }))}
        />
      )}
    </>
  );
}
