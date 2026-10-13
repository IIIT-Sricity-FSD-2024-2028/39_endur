import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { BookableSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDate, pluralise } from '../../../lib/format.js';
import { createBookable, useBookables } from '../../../lib/booking.js';

export function stateLine(bookable: BookableSummary): string {
  if (bookable.closedAt) return `Closed ${formatDate(bookable.closedAt)}`;
  if (!bookable.publicToken) {
    return bookable.slots.length === 0
      ? 'Not open — no times yet'
      : `Not open — ${pluralise(bookable.slots.length, 'time', 'times')} ready`;
  }
  const places = bookable.slots.reduce((total, slot) => total + slot.remaining, 0);
  return `Open — ${bookable.booked} booked, ${places} left`;
}

export default function Booking(): JSX.Element {
  const can = useCan();
  const navigate = useNavigate();
  const list = useBookables();

  const canCreate = can('booking.create');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (list.forbidden) {
    return (
      <>
        <PageHeader title="Booking" />
        <EmptyState
          icon="booking"
          title="Not yours to read"
          body="You do not have permission to see what is bookable here. An administrator can grant it."
        />
      </>
    );
  }

  if (list.upgrade) {
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

  const create = (): void => {
    if (name.trim() === '') return;
    setBusy(true);
    setError(null);
    void createBookable({ name: name.trim() })
      // Straight to the detail page: a bookable with no times is not finished, and the next
      // thing to do is add them.
      .then((created) => navigate(`/app/booking/${created.id}`))
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : 'That did not work.');
        setBusy(false);
      });
  };

  return (
    <>
      <PageHeader
        title="Booking"
        subtitle="Publish times people can take. Capacity is held on the server, not in the browser."
      />

      {canCreate && (
        <div className="card booking-new">
          <label className="field">
            <span className="field-label">What can people book?</span>
            <input
              className="input"
              value={name}
              placeholder="Consultation room"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create();
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || name.trim() === ''}
            onClick={create}
          >
            Add
          </button>
          {error && <p className="text-meta form-error">{error}</p>}
        </div>
      )}

      {list.rows.length === 0 && !list.loading ? (
        <EmptyState
          icon="booking"
          title="Nothing bookable yet"
          body={
            canCreate
              ? 'Name a room, a machine or a person, add some times, and open it for booking.'
              : 'Nobody has published anything bookable here yet.'
          }
        />
      ) : (
        <ul className="card-list" role="list">
          {list.rows.map((bookable) => (
            <li key={bookable.id}>
              <Link className="card booking-row" to={`/app/booking/${bookable.id}`}>
                <span className="booking-row-icon" aria-hidden="true">
                  <Icon name="booking" size={18} />
                </span>
                <span className="booking-row-main">
                  <span className="booking-row-name">{bookable.name}</span>
                  <span className="text-meta">{stateLine(bookable)}</span>
                </span>
                {bookable.publicToken && !bookable.closedAt && (
                  <span className="tag tag-good">Open</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
