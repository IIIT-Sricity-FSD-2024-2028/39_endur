// `/app/announcements`. The list is an RTK Query read shared with Home's banner; the
// composer, the confirmations and every write are `state.announcements`
// (store/screens/announcements.ts).
import { Link } from 'react-router-dom';
import type { AnnouncementSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Icon } from '../../../components/Icon.js';
import { useCan } from '../../../lib/capabilities.js';
import { formatDate } from '../../../lib/format.js';
import { useAnnouncements } from '../../../lib/announcements.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  announcementDeleted,
  announcementPublished,
  announcementsLeft,
  composerOpened,
  publishConfirmClosed,
  publishConfirmOpened,
  removeConfirmClosed,
  removeConfirmOpened,
  selectAnnouncementsScreen,
} from '../../../store/screens/announcements.js';
import { Composer } from './Composer.js';

export function readLine(announcement: AnnouncementSummary): string {
  if (!announcement.publishedAt) return 'Draft — sent to nobody yet';
  if (announcement.recipients === 0) {
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

  const dispatch = useAppDispatch();
  const screenState = useAppSelector(selectAnnouncementsScreen);
  useClearOnLeave(announcementsLeft());

  const rows = list.rows;
  const composing = screenState.composer !== null;
  const publishing = rows.find((row) => row.id === screenState.publishingId) ?? null;
  const removing = rows.find((row) => row.id === screenState.removingId) ?? null;
  const error = messageOf(screenState.failure, 'That did not work.');
  const compose = (): void => {
    dispatch(composerOpened({ editing: null }));
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
              onClick={compose}
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
                onClick={compose}
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
            const working = screenState.workingId === announcement.id;
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
                        disabled={working}
                        onClick={() => dispatch(composerOpened({ editing: announcement }))}
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
                        disabled={working}
                        onClick={() => dispatch(publishConfirmOpened({ id: announcement.id }))}
                      >
                        {working && <span className="spinner" aria-hidden="true" />}
                        Publish
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={working}
                        onClick={() => dispatch(removeConfirmOpened({ id: announcement.id }))}
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

      {composing && <Composer />}

      {publishing && (
        <ConfirmDialog
          title="Publish this announcement?"
          consequence={`It goes to everyone that audience resolves to right now, and the wording is frozen afterwards. ${publishing.title}`}
          verb="Publish"
          onCancel={() => dispatch(publishConfirmClosed())}
          onConfirm={() => void dispatch(announcementPublished(publishing.id))}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Delete this draft?"
          consequence={`"${removing.title}" is removed. It has not been sent to anybody, so nobody will notice.`}
          verb="Delete"
          destructive
          onCancel={() => dispatch(removeConfirmClosed())}
          onConfirm={() => void dispatch(announcementDeleted(removing.id))}
        />
      )}
    </>
  );
}
