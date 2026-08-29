// <AnnouncementBanner> — T-094, 24 § Announcements.
//
// Unread published announcements for the signed-in reader, at the top of `/app` Home. This
// is where the feature is visible WITHOUT navigating to it, which is the whole reason it is
// a component rather than a section of `/app/announcements`.
//
// It renders NOTHING when there is nothing unread — not an empty state. This is chrome on
// somebody else's page, and a card saying "no announcements" would take permanent space on
// the first screen after sign-in to report the normal case.
//
// Dismissing marks the reader's OWN receipt (`POST /announcements/:id/read`). There is no
// argument this component could be given that would reach anybody else's.
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

/**
 * The ones this reader has not read yet, newest first, capped at two.
 *
 * `readByMe === null` means they are not a recipient at all — an author who addressed a unit
 * they are not in — and those must not appear: a banner for a notice that was not sent to
 * you is a banner you cannot dismiss honestly.
 *
 * Capped for the reason Home caps its prompts at two: a first screen that nags with six
 * banners is a first screen people stop reading (46 § Interactions).
 */
export const unreadFor = (rows: AnnouncementSummary[], limit = 2): AnnouncementSummary[] =>
  rows.filter((row) => row.publishedAt !== null && row.readByMe === false).slice(0, limit);
