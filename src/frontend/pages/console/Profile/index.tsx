// /app/profile — the signed-in user's own account. 47.
//
// **The page earns its place with the last block, not the first.** Name, email and photo are
// housekeeping; "what you can actually do, and where" is INV-005 made personal, and it is the
// one screen in the product where somebody can answer *"why can't I see the other
// department's results?"* for themselves rather than opening a ticket.
//
// Distinct from `/app/people/:id`, which is an administrator looking at somebody else. Same
// three blocks, same component for the third — and a completely different capability path:
// this one resolves under `self`, so a person with no administrative permission at all can
// open it. That makes it the cleanest demonstration of the `self` scope in `11` §4.
import { useState } from 'react';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { FileUpload } from '../../../components/form/FileUpload.js';
import { InlineName } from '../../../components/org/InlineName.js';
import { PowersByPlace } from '../../../components/org/PowersByPlace.js';
import { Involvement } from '../../../components/org/Involvement.js';
import { PositionChip } from '../People/PositionEditor.js';
import { apiDelete, apiUpload, ApiError } from '../../../lib/api.js';
import { useRefreshSession } from '../../../lib/auth.js';
import { useCan } from '../../../lib/capabilities.js';
import { useLabels } from '../../../lib/labels.js';
import { useProfile } from '../../../lib/profile.js';
import { formatDate, formatRelative } from '../../../lib/format.js';
import { useAppSelector } from '../../../store/index.js';
import { PasswordCard } from './PasswordCard.js';

export default function Profile(): JSX.Element {
  // The store for the shell's copy of the user, the profile call for everything else. They
  // are the same person; `refresh()` is what keeps them the same person after a write.
  const sessionUser = useAppSelector((state) => state.auth.user);
  const refresh = useRefreshSession();
  const profile = useProfile();
  const labels = useLabels();
  const can = useCan();
  const [error, setError] = useState<string | null>(null);

  const user = profile.data?.user ?? null;
  const positions = profile.data?.positions ?? [];

  const message = (caught: unknown, fallback: string): string =>
    caught instanceof ApiError ? caught.message : fallback;

  return (
    <>
      <PageHeader title="My account" />

      {profile.error && (
        <p className="form-error" role="alert">
          {message(profile.error, 'Could not load your account.')}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => void profile.reload()}>
            Try again
          </button>
        </p>
      )}

      <div className="settings-page">
        <section className="settings-card" aria-labelledby="profile-you">
          <h3 className="utility" id="profile-you">You</h3>
          <div className="card">
            <div className="field">
              <label htmlFor="profile-name">Name</label>
              {/* Editable since T-051. `person.update: self` is seeded to every role, so
                  there is no gate here — a page that could not rename its own owner would
                  mean the seed had lost the universal grant (50 §1). */}
              <InlineName
                value={user?.name ?? sessionUser?.name ?? ''}
                ariaLabel="Name"
                onCommit={(name) => {
                  setError(null);
                  void profile
                    .rename(name)
                    // The shell renders the name too. One source of truth is why it changes
                    // in the top bar without a reload (47 § State).
                    .then(() => refresh())
                    .catch((caught: unknown) => {
                      setError(message(caught, 'That name could not be saved.'));
                    });
                }}
              />
            </div>

            <div className="field">
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                className="input"
                value={user?.email ?? sessionUser?.email ?? ''}
                readOnly
              />
              <p className="field-help">
                Changing an address is an identity change, so an administrator does it — with
                a record of who did. It is also the first move in taking an account over.
              </p>
            </div>

            <FileUpload
              label="Photo"
              shape="circle"
              current={user?.avatarUrl ?? sessionUser?.avatarUrl ?? null}
              hint="PNG, JPEG or WebP, up to 2 MB."
              onUpload={async (file) => {
                setError(null);
                await apiUpload<{ data: unknown }>('/profile/avatar', file);
                // Re-read the session rather than patching the slice: the avatar shows in
                // the shell too, and one source of truth is why it updates there as well.
                await refresh();
                await profile.reload();
              }}
              onRemove={async () => {
                setError(null);
                await apiDelete('/profile/avatar');
                await refresh();
                await profile.reload();
              }}
            />

            {user?.lastLoginAt && (
              <p className="field-help profile-last-seen">
                Last signed in {formatRelative(user.lastLoginAt)}, on{' '}
                {formatDate(user.lastLoginAt)}.
              </p>
            )}

            {error && <p className="field-error" role="alert">{error}</p>}
          </div>
        </section>

        <PasswordCard onSubmit={profile.changePassword} />

        <section className="settings-card" aria-labelledby="profile-positions">
          <h3 className="utility" id="profile-positions">Your positions</h3>
          <div className="card">
            {positions.length === 0 ? (
              // A real state for somebody just invited, and it must not read as an error
              // (47 § States). The second sentence is the actionable half.
              <p className="text-muted">
                You don&apos;t hold any positions yet. Whoever set up your account can give
                you one — until then you can sign in and see this page, and nothing else.
              </p>
            ) : (
              <div className="person-positions">
                {positions.map((position) => (
                  <PositionChip
                    key={position.edgeId}
                    roleName={position.roleName}
                    roleLevel={position.roleLevel}
                    unitName={position.unitName}
                    isPrimary={position.isPrimary}
                    validTo={position.validTo}
                  />
                ))}
              </div>
            )}
            {/* No add, no remove, and no gate deciding that — READ-ONLY BY CONSTRUCTION.
                You cannot grant yourself a position, which is the self-approval loop 33
                warns about, closed structurally here rather than detected later. */}
            <p className="field-help">
              Read-only. Nobody gives themselves a position — including you.
            </p>
          </div>
        </section>

        {/* NOT GATED, AND NOT CONDITIONAL EITHER — the two differences from `/people/:id`.
            The server does not filter this list by `campaign.read` when you are reading
            your own profile (`47` § Capabilities), and the empty state is a real answer
            here rather than a permission artefact: "nothing is waiting on you" is worth
            saying to somebody who came looking. */}
        <section className="settings-card" aria-labelledby="profile-involvement">
          <h3 className="utility" id="profile-involvement">
            {labels.campaign.many} you are part of
          </h3>
          <div className="card">
            {profile.loading && !profile.data ? (
              <div className="tree-skeleton" aria-hidden="true">
                {[0, 1].map((row) => <span key={row} className="skeleton-row wide" />)}
              </div>
            ) : (
              <Involvement
                items={profile.data?.involvement ?? []}
                who="you"
                emptyHint="Nothing is open for you to answer right now."
                canOpenCampaign={can('campaign.read')}
              />
            )}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="profile-powers">
          <h3 className="utility" id="profile-powers">What you can do, and where</h3>
          <div className="card">
            {profile.loading && !profile.data ? (
              <div className="tree-skeleton" aria-hidden="true">
                {[0, 1, 2].map((row) => <span key={row} className="skeleton-row wide" />)}
              </div>
            ) : (
              <PowersByPlace
                places={profile.data?.powersByPlace ?? []}
                emptyHint={
                  positions.length === 0
                    ? 'Nothing yet, anywhere — a position is what grants powers.'
                    : 'Anywhere else: nothing. Powers are boxed to the place the position sits.'
                }
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
