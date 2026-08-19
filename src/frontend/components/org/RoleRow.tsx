// <RoleRow> — 24 §4, design_specs/design/03 §3.4 step 2.
//
// LEVEL IS DERIVED FROM ROW ORDER, NEVER ENTERED — same rule as question position and the
// wizard's units. A typed level and a row order can disagree, and then one of them is
// silently wrong.
//
// The "Sees…" text is the most important thing on the step. When an evaluator asks "how do
// permissions work?", that column is the answer: the visibility rule in plain English, per
// row, updating live as rows move.
import { Icon } from '../Icon.js';
import { InlineName } from './InlineName.js';

/**
 * The seeded default the level rule expresses (CONF-002: ordering, never the enforcement —
 * the GRANT resolver decides, and a deny still beats everything).
 *
 * L1 of 4 -> "Sees everything" · L2 -> "Sees levels 3–4" · L3 -> "Sees level 4" ·
 * L4 -> "Responds only". Somebody has to be at the bottom, and the bottom answers.
 */
export function seesText(level: number, total: number): string {
  if (level === total) return 'Responds only';
  if (level === 1) return 'Sees everything';
  if (level + 1 === total) return `Sees level ${total}`;
  return `Sees levels ${level + 1}–${total}`;
}

export function RoleRow({
  name,
  level,
  total,
  autoFocus = false,
  onRename,
  onDelete,
  onMove,
}: {
  name: string;
  level: number;
  total: number;
  autoFocus?: boolean;
  onRename: (name: string) => void;
  onDelete: (() => void) | undefined;
  /** Keyboard and touch path for reordering. Drag is handled by the list that owns order. */
  onMove?: ((direction: -1 | 1) => void) | undefined;
}): JSX.Element {
  return (
    <div className="role-row">
      <Icon name="drag" size={16} className="role-grip" label="Drag to reorder" />
      <span className="role-level" aria-label={`Level ${level}`}>{level}</span>

      <InlineName value={name} onCommit={onRename} ariaLabel="Role name" autoFocus={autoFocus} />

      <span className="role-sees text-meta">{seesText(level, total)}</span>

      {onMove && (
        <span className="role-move">
          <button
            type="button"
            className="btn btn-icon"
            disabled={level === 1}
            onClick={() => onMove(-1)}
          >
            <Icon name="trend-up" size={16} label={`Move ${name} up`} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            disabled={level === total}
            onClick={() => onMove(1)}
          >
            <Icon name="trend-down" size={16} label={`Move ${name} down`} />
          </button>
        </span>
      )}

      {/* The lowest level cannot be deleted — somebody has to be at the bottom, and an org
          whose most junior role can be removed has nobody left to answer a form. */}
      <button
        type="button"
        className="btn btn-icon"
        disabled={onDelete === undefined}
        onClick={() => onDelete?.()}
      >
        <Icon
          name="delete"
          size={16}
          label={onDelete ? `Delete ${name}` : `${name} is the lowest level and cannot be deleted`}
        />
      </button>
    </div>
  );
}
