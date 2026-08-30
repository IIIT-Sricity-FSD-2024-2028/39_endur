// <SlotGrid> — T-095, 24 §3. The one shape that renders slots on BOTH sides of the product.
//
// The console's editor and the public picker use this component, not two that look alike. A
// picker that draws availability differently from the editor which produced it is how "2
// left" comes to mean two different things on two screens, and the person who finds out is
// a guest standing at a reception desk.
//
// IT DECIDES NOTHING. `remaining` always arrives from the server, which counts live bookings
// under a row lock at the moment of writing (13 § Booking). A grid still showing a stale
// "1 left" is refused with a 409 rather than allowed to double-book, so this file's only job
// is to make a full slot look unpressable BEFORE somebody presses it.
//
// NO <Icon>, and that is a constraint rather than a preference: this renders inside the
// respondent tree, and `pages/respond/bundle.test.ts` asserts that nothing heavier than
// React and the router reaches a phone on a venue network. <Icon> is thirty lucide glyphs.
import type { SlotView } from '@endur/shared';

/** The public payload omits `capacity` (13 §6), so the grid must work without it. */
export type SlotViewish = Omit<SlotView, 'capacity'> & { capacity?: number };

export type SlotGridProps = {
  slots: SlotViewish[];
  selectedId?: string | null;
  /** Absent in read-only mode — the console's list view and a closed picker. */
  onSelect?: (slotId: string) => void;
  /** The console's only extra affordance. Its absence is what makes this the picker. */
  onRemove?: (slotId: string) => void;
};

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
/* The date block is torn into its three parts so the weekday, the numeral and the month can
   be sized independently — one 22px numeral is what makes a column of days scannable, and a
   single formatted string cannot give you that. */
const DOW = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DAY_NUM = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' });

type SlotDay = { key: string; label: string; start: Date; slots: SlotViewish[] };

/**
 * Slots, grouped into the days they fall on and sorted within each.
 *
 * THE DAY IS THE STRUCTURE, not decoration on top of it. Nine cards each repeating
 * "Tue, 1 Sept" spend the reader's whole attention on the one thing every card has in
 * common; grouping states the date once and leaves the times to differ.
 */
export function groupByDay(slots: SlotViewish[]): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const slot of slots) {
    const start = new Date(slot.startsAt);
    // Local calendar day. Not the ISO date — a 9pm slot must not land on tomorrow for a
    // booker standing in the room where it happens.
    const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
    const day = days.get(key);
    if (day) day.slots.push(slot);
    else days.set(key, { key, label: DAY.format(start), start, slots: [slot] });
  }
  return [...days.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((day) => ({
      ...day,
      slots: [...day.slots].sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    }));
}

/**
 * The sentence under a slot, and the three cases are deliberately not one format string.
 *
 * "1 left" is called out on its own because it is the state the demo exists to show, and
 * because it is the only one where a booker's decision is urgent.
 */
export function remainingLabel(remaining: number): string {
  if (remaining <= 0) return 'Full';
  if (remaining === 1) return '1 left';
  return `${remaining} left`;
}

export function SlotGrid({ slots, selectedId, onSelect, onRemove }: SlotGridProps): JSX.Element {
  if (slots.length === 0) {
    return <p className="text-muted">No times yet.</p>;
  }

  return (
    <div className="slot-cal">
      {groupByDay(slots).map((day) => (
        <section className="slot-cal-day" key={day.key}>
          {/* Not a heading element: this component renders under an <h2> on the console and
              under a different one on the picker, and a fixed level would be wrong on one of
              them. The list below carries the date as its accessible name instead. */}
          <p className="slot-date" aria-hidden="true">
            <span className="slot-date-dow">{DOW.format(day.start)}</span>
            <span className="slot-date-num">{DAY_NUM.format(day.start)}</span>
            <span className="slot-date-mon">{MONTH.format(day.start)}</span>
          </p>

          <ul className="slot-times" role="list" aria-label={day.label}>
            {day.slots.map((slot) => {
              const full = slot.remaining <= 0;
              const selected = selectedId === slot.id;
              const state = full ? 'is-full' : slot.remaining === 1 ? 'is-nearly' : 'is-open';
              const start = new Date(slot.startsAt);
              const end = new Date(slot.endsAt);
              const when = `${DAY.format(start)}, ${TIME.format(start)} to ${TIME.format(end)}`;

              return (
                <li key={slot.id} className={`slot ${state}${selected ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="slot-face"
                    // A full slot has NO action at all rather than a disabled button that
                    // still looks pressable — the rule <StartCard>'s `soon` state follows.
                    disabled={full || !onSelect}
                    aria-pressed={onSelect ? selected : undefined}
                    // The visible text is a time and a count; a screen reader gets the
                    // sentence, including the day the chip no longer repeats.
                    aria-label={`${when} — ${remainingLabel(slot.remaining)}`}
                    onClick={onSelect ? () => onSelect(slot.id) : undefined}
                  >
                    <span className="slot-time">
                      {TIME.format(start)} – {TIME.format(end)}
                    </span>
                    <span className="slot-left">{remainingLabel(slot.remaining)}</span>
                  </button>

                  {onRemove && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm slot-remove"
                      onClick={() => onRemove(slot.id)}
                    >
                      Remove
                      <span className="sr-only"> the slot at {when}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
