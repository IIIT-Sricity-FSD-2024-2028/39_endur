// /book/:token — the public slot picker. 13 § Booking, T-095, DEC-090.
//
// IN THE RESPONDENT TREE AND NOT A FIFTH ONE. This page has every property that tree exists
// for: no account, a phone, a venue network, a token that IS the access. Adding a fourth
// world would duplicate a layout and an error boundary to gain nothing, and
// `pages/respond/bundle.test.ts` walks this file to hold the line that matters — nothing
// reachable from here may be console code, a store, or anything heavier than React and the
// router.
//
// TWO THINGS THIS SCREEN DOES THAT THE FORM NEXT DOOR DOES NOT:
//
//   1. IT ASKS FOR A NAME AND AN EMAIL. That is the difference between a booking and a
//      response, and it is deliberate (DEC-090): a booking that cannot be honoured is not a
//      booking. A response names nobody and never will (INV-006). The two never join, and
//      the page says out loud what it is collecting rather than letting somebody assume this
//      is as anonymous as the feedback form on the next table card.
//   2. IT CAN LOSE. A slot fills between the render and the press, and the server answers
//      409. That is the one failure this feature expects in front of an audience, so it gets
//      a sentence of its own and the grid refreshes underneath it.
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SlotGrid } from '../../components/data/SlotGrid.js';
import { ApiError } from '../../lib/api.js';
import {
  bookKey,
  cancelWithToken,
  forgetBooking,
  rememberBooking,
  rememberedBooking,
  takeSlot,
  usePublicBookable,
} from '../../lib/booking.js';
import { Unavailable } from './Unavailable.js';

const WHEN = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** The sentence a booker reads when they lost the race. Written once, deliberately. */
const TOO_SLOW = 'That slot just filled. Pick another one.';
const GENERIC_FAILURE = 'That did not go through. Your details are still here — try again.';

export default function Book(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const { bookable, loading, unavailable, error, reload } = usePublicBookable(token);

  const [slotId, setSlotId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Read once, on mount: a booker who reloads should see their booking, not an empty form.
  // Best-effort local knowledge, exactly as the response marker is (39 § State).
  const [cancelToken, setCancelToken] = useState<string | null>(() =>
    token ? rememberedBooking(token) : null,
  );
  const [taken, setTaken] = useState<{ startsAt: string; endsAt: string } | null>(null);

  const submit = useCallback(async () => {
    if (!token || !slotId) return;
    setSending(true);
    setFailure(null);
    try {
      const receipt = await takeSlot(token, { slotId, name, email }, bookKey());
      rememberBooking(token, receipt.cancelToken);
      setCancelToken(receipt.cancelToken);
      setTaken({ startsAt: receipt.startsAt, endsAt: receipt.endsAt });
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      // 409 is not a mistake the booker made, so it must not read like one. Refreshing the
      // grid under the message is the other half: the slot they wanted is now visibly full,
      // and the next one is visibly not.
      setFailure(status === 409 ? TOO_SLOW : GENERIC_FAILURE);
      setSlotId(null);
      await reload();
    } finally {
      setSending(false);
    }
  }, [token, slotId, name, email, reload]);

  const cancel = useCallback(async () => {
    if (!token || !cancelToken) return;
    setSending(true);
    try {
      await cancelWithToken(cancelToken);
      forgetBooking(token);
      setCancelToken(null);
      setTaken(null);
      await reload();
    } catch {
      setFailure(GENERIC_FAILURE);
    } finally {
      setSending(false);
    }
  }, [token, cancelToken, reload]);

  if (loading) {
    return (
      <div className="rf-end">
        <p className="rf-end-body">Loading…</p>
      </div>
    );
  }
  // The uniform 404 — unknown, unopened, closed. The server refuses to say which (13 §6),
  // so this screen names all three possibilities rather than guessing one.
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
        <button type="button" className="btn btn-secondary" disabled={sending} onClick={() => void cancel()}>
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
      <SlotGrid slots={bookable.slots} selectedId={slotId} onSelect={setSlotId} />

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
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
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
        onClick={() => void submit()}
      >
        {sending ? 'Booking…' : 'Book this time'}
      </button>

      <p className="rf-brand" aria-hidden="true">Endur</p>
    </div>
  );
}
