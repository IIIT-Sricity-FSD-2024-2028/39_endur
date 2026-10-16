import type { SlotView } from '@endur/shared';

export type SlotViewish = Omit<SlotView, 'capacity'> & { capacity?: number };

export type SlotGridProps = {
  slots: SlotViewish[];
  selectedId?: string | null;
  onSelect?: (slotId: string) => void;
  onRemove?: (slotId: string) => void;
  /** What to say when there are no slots. The console has none yet; a guest may have none left. */
  emptyText?: string;
};

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const DOW = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DAY_NUM = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' });

type SlotDay = { key: string; label: string; start: Date; slots: SlotViewish[] };

export function groupByDay(slots: SlotViewish[]): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const slot of slots) {
    const start = new Date(slot.startsAt);
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

export function remainingLabel(remaining: number): string {
  if (remaining <= 0) return 'Full';
  if (remaining === 1) return '1 left';
  return `${remaining} left`;
}

export function SlotGrid({
  slots,
  selectedId,
  onSelect,
  onRemove,
  emptyText = 'No times yet.',
}: SlotGridProps): JSX.Element {
  if (slots.length === 0) {
    return <p className="text-muted">{emptyText}</p>;
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
                    disabled={full || !onSelect}
                    aria-pressed={onSelect ? selected : undefined}
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
