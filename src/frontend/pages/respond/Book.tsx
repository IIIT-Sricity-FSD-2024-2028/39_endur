// `/book/:token`: a public booking page. What the booker picks and types is
// `state.respond.bookings[token]` (store/screens/respond.ts); taking and cancelling a slot are
// thunks there. docs/REDUX-PLAN.md §6.10 (R-704).
import { useParams } from 'react-router-dom';
import { SlotGrid } from '../../components/data/SlotGrid.js';
import { rememberedBooking, usePublicBookable } from '../../lib/booking-public.js';
import { useAppDispatch, useAppSelector } from '../../store/index.js';
import { useClearOnLeave } from '../../store/screens/common.js';
import {
  bookerEmailEdited,
  bookerNameEdited,
  bookingCancelled,
  bookingPageLeft,
  selectBooking,
  slotPicked,
  slotTaken,
} from '../../store/screens/respond.js';
import { Unavailable } from './Unavailable.js';

const WHEN = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export default function Book(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const { bookable, loading, unavailable, error, reload } = usePublicBookable(token);

  const bookingToken = token ?? '';
  const dispatch = useAppDispatch();
  const fill = useAppSelector((state) => selectBooking(state, bookingToken));
  useClearOnLeave(bookingPageLeft({ token: bookingToken }));
  const { slotId, name, email, sending, failure } = fill;
  // Booked on THIS visit (the receipt), or on an earlier one (the key this device kept),
  // unless it was cancelled here. The device's marker is read where it lives, not copied.
  const cancelToken =
    fill.booked?.cancelToken ?? (fill.cancelled || !token ? null : rememberedBooking(token));
  const taken = fill.booked;

  const submit = (): void => {
    if (token) void dispatch(slotTaken({ token }));
  };
  const cancel = (): void => {
    if (token && cancelToken) void dispatch(bookingCancelled({ token, cancelToken }));
  };

  if (loading) {
    return (
      <div className="rf-end">
        <p className="rf-end-body">Loading…</p>
      </div>
    );
  }
  if (unavailable || !bookable) return <Unavailable variant="unavailable" />;
  if (error) return <Unavailable variant="error" onRetry={() => void reload()} />;

  if (cancelToken) {
    return (
      <div className="rf-end">
        <h1 className="rf-end-title">You're booked.</h1>
        {taken && <p className="rf-end-body">{WHEN.format(new Date(taken.startsAt))}</p>}
        <p className="rf-end-body">
          {bookable.name} — {bookable.orgName}
        </p>
        {/* No account was needed to book and none is needed to undo it: the cancel key came
            back with the booking and is kept on this device (DEC-090). */}
        <button type="button" className="btn btn-secondary" disabled={sending} onClick={cancel}>
          Cancel this booking
        </button>
        <p className="rf-brand" aria-hidden="true">Endur</p>
      </div>
    );
  }

  const ready = slotId !== null && name.trim() !== '' && email.trim() !== '';

  return (
    <div className="rf-book">
      <header className="rf-book-head">
        <p className="rf-book-org">{bookable.orgName}</p>
        <h1 className="rf-book-title">{bookable.name}</h1>
        {bookable.description && <p className="rf-book-body">{bookable.description}</p>}
      </header>

      <h2 className="rf-book-heading">Pick a time</h2>
      {/* The server leaves out times that have already started, so an empty list here can
          mean every time has passed, not that none were ever added. */}
      <SlotGrid
        slots={bookable.slots}
        selectedId={slotId}
        onSelect={(id) => dispatch(slotPicked({ token: bookingToken, slotId: id }))}
        emptyText="There are no upcoming times to book right now."
      />

      <h2 className="rf-book-heading">Your details</h2>
      {/* SAID OUT LOUD, because the feedback form on the next table card promises the
          opposite and a guest has no way to know these are different systems. */}
      <p className="rf-book-note">
        A booking is not anonymous — {bookable.orgName} needs to know who is coming so they can
        hold the place for you.
      </p>

      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          value={name}
          autoComplete="name"
          onChange={(event) => dispatch(bookerNameEdited({ token: bookingToken, name: event.target.value }))}
        />
      </label>

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => dispatch(bookerEmailEdited({ token: bookingToken, email: event.target.value }))}
        />
      </label>

      {failure && (
        <p className="rf-book-error" role="alert">
          {failure}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-lg rf-book-submit"
        disabled={!ready || sending}
        onClick={submit}
      >
        {sending ? 'Booking…' : 'Book this time'}
      </button>

      <p className="rf-brand" aria-hidden="true">Endur</p>
    </div>
  );
}
