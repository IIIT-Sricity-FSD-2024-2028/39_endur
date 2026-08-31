// T-094 — /app/announcements. 61, 13 § Announcements.
//
// Two states of one row, and the difference between them is the whole feature:
//
//   DRAFT      — editable, deletable, sent to nobody. Both counts are zero because it has
//                been sent to nobody, not because nobody has read it.
//   PUBLISHED  — frozen, and carrying a fraction. "12 of 40 have read this" is only
//                meaningful because the 40 was taken when the notice was SENT: the receipts
//                are written at publish time, one per resolved recipient (13 § Announcements).
//
// What is NOT here is a recipient list. The audience is a rule, resolved by the server, and
// the only names this screen ever prints are the author's.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnnouncementSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Icon } from '../../../components/Icon.js';
import { ApiError } from '../../../lib/api.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDate } from '../../../lib/format.js';
import {
  deleteAnnouncement,
  publishAnnouncement,
  publishKey,
  useAnnouncements,
} from '../../../lib/announcements.js';
import { Composer } from './Composer.js';

/** The sentence a published row owes its author, and the one a draft owes instead. */
export function readLine(announcement: AnnouncementSummary): string {
  if (!announcement.publishedAt) return 'Draft — sent to nobody yet';
  if (announcement.recipients === 0) {
    // An audience that resolved to nobody. Worth saying plainly: it is almost always a rule
    // pointed at a unit whose people have no sign-ins, and a silent "0 of 0" reads as a bug.
    return 'Published, but it reached nobody — that audience has no accounts in it';
  }
  return `${announcement.read} of ${announcement.recipients} have read this`;
}

export default function Announcements(): JSX.Element {
  const can = useCan();
  const list = useAnnouncements();

  const canWrite = can('announcement.create');
  const canPublish = can('announcement.publish');
  const canDelete = can('announcement.delete');

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<AnnouncementSummary | null>(null);
  const [publishing, setPublishing] = useState<AnnouncementSummary | null>(null);
  const [removing, setRemoving] = useState<AnnouncementSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = list.rows;

  const act = (work: Promise<unknown>): void => {
    setError(null);
    void work
      .then(() => list.reload())
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.message : 'That did not work.');
      });
  };

  if (list.forbidden) {
    return (
      <>
        <PageHeader title="Announcements" />
        <EmptyState
          icon="announcement"
          title="Not yours to read"
          body="You do not have permission to read announcements here. An administrator can grant it."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="One-way notices, read inside Endur. Nothing is emailed."
        action={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setComposing(true);
              }}
            >
              <Icon name="add" size={18} /> New announcement
            </button>
          ) : undefined
        }
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {list.error && (
        <p className="form-error" role="alert">
          {list.error.message}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void list.reload()}>
            Try again
          </button>
        </p>
      )}

      {list.loading && rows.length === 0 ? (
        <div className="cgrid" aria-hidden="true">
          {[0, 1].map((slot) => (
            <div className="card ccard" key={slot}>
              <span className="skeleton-row" />
              <span className="skeleton-row wide" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="announcement"
          title={canWrite ? 'Nothing announced yet' : 'Nothing has been sent to you'}
          body={
            canWrite
              ? 'An announcement goes to everyone an audience rule resolves to, and tells you how many of them have read it. Nothing leaves the product.'
              : 'When somebody announces something to a group you are in, it appears here and on your home page.'
          }
          action={
            canWrite ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setEditing(null);
                  setComposing(true);
                }}
              >
                Write one
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="cgrid">
          {rows.map((announcement) => {
            const published = announcement.publishedAt !== null;
            return (
              <article className="card ccard" key={announcement.id}>
                <div className="ccard-top">
                  <span className={published ? 'tag tag-accent-2' : 'tag tag-neutral is-draft'}>
                    {published ? 'Published' : 'Draft'}
                  </span>
                  <span className="text-meta">
                    {formatDate(announcement.publishedAt ?? announcement.createdAt)}
                  </span>
                </div>
                <h4 className="ccard-name">{announcement.title}</h4>
                <p className="ccard-meta text-meta">
                  {announcement.body}
                </p>
                <p className="ccard-count">{readLine(announcement)}</p>
                {announcement.authorName && (
                  <p className="ccard-note text-meta">Written by {announcement.authorName}</p>
                )}

                {!published && (
                  <div className="ccard-actions">
                    {canWrite && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditing(announcement);
                          setComposing(true);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {/* Gated on `announcement.publish`, which a drafter may not hold — the
                        gap between the two verbs is the reason they are separate (11 §3),
                        and offering a button the API will refuse would hide that. */}
                    {canPublish && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setPublishing(announcement)}
                      >
                        Publish
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setRemoving(announcement)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {canWrite && rows.length > 0 && (
        <p className="text-meta">
          Published announcements cannot be edited. <Link to="/app">Your home page</Link> shows
          the ones you have not read.
        </p>
      )}

      {composing && (
        <Composer
          editing={editing}
          onCancel={() => {
            setComposing(false);
            setEditing(null);
          }}
          onSaved={() => {
            setComposing(false);
            setEditing(null);
            void list.reload();
          }}
        />
      )}

      {publishing && (
        <ConfirmDialog
          title="Publish this announcement?"
          // The COUNT, in the sentence. Publishing is not undoable, and "Are you sure?"
          // tells the reader nothing they did not already know (24 §6).
          consequence={`It goes to everyone that audience resolves to right now, and the wording is frozen afterwards. ${publishing.title}`}
          verb="Publish"
          onCancel={() => setPublishing(null)}
          onConfirm={() => {
            const target = publishing;
            setPublishing(null);
            act(publishAnnouncement(target.id, publishKey(target.id)));
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete this draft?"
          consequence={`"${removing.title}" is removed. It has not been sent to anybody, so nobody will notice.`}
          verb="Delete"
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            act(deleteAnnouncement(target.id));
          }}
        />
      )}
    </>
  );
}
