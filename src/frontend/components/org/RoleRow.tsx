import { Icon } from '../Icon.js';
import { InlineName } from './InlineName.js';

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
  peopleCount,
  grantCount,
  editable = true,
  busy = false,
  onRename,
  onDelete,
  onMove,
}: {
  name: string;
  level: number;
  total: number;
  autoFocus?: boolean;
  peopleCount?: number | undefined;
  grantCount?: number | undefined;
  editable?: boolean;
  busy?: boolean;
  onRename: (name: string) => void;
  onDelete: (() => void) | undefined;
  onMove?: ((direction: -1 | 1) => void) | undefined;
}): JSX.Element {
  return (
    <div className="role-row">
      {editable && <Icon name="drag" size={16} className="role-grip" label="Drag to reorder" />}
      <span className="role-level" aria-label={`Level ${level}`}>{level}</span>

      {editable ? (
        <InlineName value={name} onCommit={onRename} ariaLabel="Role name" autoFocus={autoFocus} />
      ) : (
        <span className="role-name-static">{name}</span>
      )}

      <span className="role-sees text-meta">{seesText(level, total)}</span>

      {peopleCount !== undefined && grantCount !== undefined && (
        <span className="role-counts text-meta">
          {counted(peopleCount, 'person', 'people')} · {counted(grantCount, 'power', 'powers')}
        </span>
      )}

      {editable && onMove && (
        <span className="role-move">
          <button
            type="button"
            className="btn btn-icon"
            disabled={level === 1 || busy}
            onClick={() => onMove(-1)}
          >
            <Icon name="trend-up" size={16} label={`Move ${name} up`} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            disabled={level === total || busy}
            onClick={() => onMove(1)}
          >
            <Icon name="trend-down" size={16} label={`Move ${name} down`} />
          </button>
        </span>
      )}

      {/* The lowest level cannot be deleted — somebody has to be at the bottom, and an org
          whose most junior role can be removed has nobody left to answer a form. */}
      {editable && (
      <button
        type="button"
        className="btn btn-icon"
        disabled={onDelete === undefined || busy}
        onClick={() => onDelete?.()}
      >
        <Icon
          name="delete"
          size={16}
          label={onDelete ? `Delete ${name}` : `${name} is the lowest level and cannot be deleted`}
        />
      </button>
      )}
    </div>
  );
}

const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
