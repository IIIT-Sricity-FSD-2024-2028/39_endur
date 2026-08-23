// /app/profile — the signed-in user's own account. 47.
//
// PARTIAL, DELIBERATELY. `T-062` needed `<FileUpload>` mounted in its second place, and
// `47`'s other sections — password change, and the effective-powers-by-place view that
// reuses `34`'s resolver panel — are `T-051`. What is here is complete and real; what is
// not is named below rather than faked, so nobody has to guess which is which.
//
// The avatar is the cleanest demonstration of the `self` scope in `11` §4: the route is
// `POST /profile/avatar`, the target is built from the PRINCIPAL, and there is no id in
// the request for anyone to point somewhere else.
import { useState } from 'react';
import { PageHeader } from '../../components/layout/PageHeader.js';
import { FileUpload } from '../../components/form/FileUpload.js';
import { apiDelete, apiUpload } from '../../lib/api.js';
import { useRefreshSession } from '../../lib/auth.js';
import { useAppSelector } from '../../store/index.js';

export default function Profile(): JSX.Element {
  const user = useAppSelector((state) => state.auth.user);
  const refresh = useRefreshSession();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="My account" />

      <div className="settings-page">
        <section className="settings-card" aria-labelledby="profile-you">
          <h3 className="utility" id="profile-you">You</h3>
          <div className="card">
            <div className="field">
              <label htmlFor="profile-name">Name</label>
              {/* Read-only here: editing it is part of T-051, and an input that silently
                  discards what you typed is worse than a value you can see. */}
              <input id="profile-name" className="input" value={user?.name ?? ''} readOnly />
            </div>
            <div className="field">
              <label htmlFor="profile-email">Email</label>
              <input id="profile-email" className="input" value={user?.email ?? ''} readOnly />
            </div>

            <FileUpload
              label="Photo"
              shape="circle"
              current={user?.avatarUrl ?? null}
              hint="PNG, JPEG or WebP, up to 2 MB."
              onUpload={async (file) => {
                setError(null);
                await apiUpload<{ data: unknown }>('/profile/avatar', file);
                // Re-read the session rather than patching the slice: the avatar shows in
                // the shell too, and one source of truth is why it updates there as well.
                await refresh();
              }}
              onRemove={async () => {
                setError(null);
                await apiDelete('/profile/avatar');
                await refresh();
              }}
            />

            {error && <p className="field-error" role="alert">{error}</p>}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="profile-rest">
          <h3 className="utility" id="profile-rest">Still to come</h3>
          <p className="text-muted">
            Changing your password, and seeing what you can do in each place — T-051,
            architecture/47.
          </p>
        </section>
      </div>
    </>
  );
}
