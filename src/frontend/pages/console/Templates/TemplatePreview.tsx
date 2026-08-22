// A drawing of the form, at a glance. 36 § Interactions.
//
// The library grid used to be twelve cards of identical text, and the only way to tell a
// four-question check-in from a twelve-question review was to read the count. A template is
// a SHAPE — how long it is, what kind of answers it asks for — and a shape is the one thing
// text is bad at.
//
// HONESTY RULE. A card knows only how many questions a template has, never what kind they
// are, so the card's drawing shows neutral answer strips: "a form, this long". The dialog
// has fetched the real questions, so it draws the real widgets. Nothing here ever guesses a
// question kind and draws it as though it knew — a thumbnail full of rating scales on a
// template made of free text is a lie told in pictures.
import type { QuestionKind } from '@endur/shared';

const W = 260;
const ROW_H = 30;
const PAD = 16;
const HEAD = 34;
/** Past six the rows stop being legible at thumbnail size and become texture. */
const MAX_ROWS = 6;

/** Each kind gets a mark that matches how it is actually answered. */
function widget(kind: QuestionKind, y: number): JSX.Element {
  switch (kind) {
    case 'rating':
      return (
        <>
          {[0, 1, 2, 3, 4].map((index) => (
            <circle key={index} className="tp-dot" cx={PAD + 6 + index * 17} cy={y} r={5} />
          ))}
        </>
      );
    case 'nps':
      return (
        <>
          {Array.from({ length: 9 }, (_, index) => (
            <rect key={index} className="tp-tick" x={PAD + index * 12} y={y - 5} width={7} height={10} rx={2} />
          ))}
        </>
      );
    case 'single':
      return (
        <>
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <circle className="tp-ring" cx={PAD + 6 + index * 46} cy={y} r={5} />
              <rect className="tp-line" x={PAD + 16 + index * 46} y={y - 3} width={22} height={6} rx={3} />
            </g>
          ))}
        </>
      );
    case 'multi':
      return (
        <>
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <rect className="tp-ring" x={PAD + index * 46} y={y - 5} width={10} height={10} rx={3} />
              <rect className="tp-line" x={PAD + 16 + index * 46} y={y - 3} width={22} height={6} rx={3} />
            </g>
          ))}
        </>
      );
    case 'yesno':
      return (
        <>
          {[0, 1].map((index) => (
            <rect key={index} className="tp-pill" x={PAD + index * 52} y={y - 7} width={44} height={14} rx={7} />
          ))}
        </>
      );
    case 'text':
    default:
      return (
        <>
          <rect className="tp-field" x={PAD} y={y - 9} width={W - PAD * 2} height={18} rx={6} />
        </>
      );
  }
}

export function TemplatePreview({
  questionCount,
  kinds,
  className,
}: {
  questionCount: number;
  /** The real question kinds, when they are known. Absent on a card. */
  kinds?: QuestionKind[] | undefined;
  className?: string;
}): JSX.Element {
  const rows = Math.max(1, Math.min(MAX_ROWS, kinds?.length ?? questionCount));
  const height = HEAD + PAD + rows * ROW_H + PAD;
  const hidden = (kinds?.length ?? questionCount) - rows;

  return (
    <svg
      className={className ? `tp ${className}` : 'tp'}
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={`Form with ${questionCount} question${questionCount === 1 ? '' : 's'}`}
      preserveAspectRatio="xMidYMin meet"
    >
      <rect className="tp-paper" x={0.75} y={0.75} width={W - 1.5} height={height - 1.5} rx={12} />

      {/* The form's own header: a name and a line of instruction. */}
      <rect className="tp-title" x={PAD} y={14} width={104} height={8} rx={4} />
      <rect className="tp-sub" x={PAD} y={27} width={62} height={5} rx={2.5} />
      <line className="tp-rule" x1={PAD} y1={HEAD + 8} x2={W - PAD} y2={HEAD + 8} />

      {Array.from({ length: rows }, (_, index) => {
        const top = HEAD + PAD + index * ROW_H;
        const kind = kinds?.[index];
        return (
          <g className="tp-row" key={index} style={{ animationDelay: `${120 + index * 70}ms` }}>
            {/* The question itself — a line of text, varied in length so the block reads
                as writing rather than as a stack of identical bars. */}
            <rect
              className="tp-label"
              x={PAD}
              y={top}
              width={[150, 122, 168, 136, 158, 114][index % 6]}
              height={6}
              rx={3}
            />
            {kind ? (
              widget(kind, top + 17)
            ) : (
              // No kinds known: a neutral answer strip. It says "something is answered
              // here" and does not pretend to know what.
              <rect className="tp-strip" x={PAD} y={top + 12} width={W - PAD * 2} height={9} rx={4.5} />
            )}
          </g>
        );
      })}

      {hidden > 0 && (
        <text className="tp-more" x={W - PAD} y={height - 9} textAnchor="end">
          +{hidden} more
        </text>
      )}
    </svg>
  );
}
