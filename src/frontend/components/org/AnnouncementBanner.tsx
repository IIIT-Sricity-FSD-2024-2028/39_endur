import type { AnnouncementSummary } from '@endur/shared';
import { Icon } from '../Icon.js';

export function AnnouncementBanner({
  items,
  onDismiss,
}: {
  items: AnnouncementSummary[];
  onDismiss: (id: string) => void;
}): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <ul className="home-prompts" aria-label="Announcements">
      {items.map((announcement) => (
        <li className="card home-prompt" key={announcement.id}>
          <div>
            <p className="home-prompt-title">
              <Icon name="announcement" size={16} /> {announcement.title}
            </p>
            <p className="text-meta">{announcement.body}</p>
          </div>
          {/* "Got it" and not "Dismiss": pressing it says the reader has read the notice,
              which is exactly what the receipt records. */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDismiss(announcement.id)}
          >
            Got it
          </button>
        </li>
      ))}
    </ul>
  );
}

export const unreadFor = (rows: AnnouncementSummary[], limit = 2): AnnouncementSummary[] =>
  rows.filter((row) => row.publishedAt !== null && row.readByMe === false).slice(0, limit);
