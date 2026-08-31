// The caller's own account — reads and writes. 47 § Data contract, 23 §3.
//
// A separate seam from `lib/people.ts` even though the shapes overlap, because the QUESTION
// is different: nothing here takes an id. That is `self` scope on the client side of the
// wire — a page importing this file cannot ask about anybody else, because there is no
// argument for it to pass.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangePasswordBody, ProfileView } from '@endur/shared';
import { apiGet, apiPatch, apiPost } from './api.js';
import type { Loadable } from './org.js';

export type ProfileController = Loadable<ProfileView> & {
  reload: () => Promise<void>;
  rename: (name: string) => Promise<void>;
  changePassword: (body: ChangePasswordBody) => Promise<void>;
};

export function useProfile(): ProfileController {
  const [state, setState] = useState<Loadable<ProfileView>>({
    data: null, loading: true, error: null,
  });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const { data } = await apiGet<{ data: ProfileView }>('/profile');
      if (alive.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (alive.current) {
        setState((current) => ({ ...current, loading: false, error: error as Error }));
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...state,
    reload: load,
    /**
     * The response is the whole profile again, and it replaces state directly — no reload.
     * A rename cannot change the positions or the powers, so a second round trip would buy
     * nothing. Compare `usePerson`, where a write CAN change the powers and re-reads.
     */
    rename: useCallback(async (name: string) => {
      const { data } = await apiPatch<{ name: string }, { data: ProfileView }>(
        '/profile', { name },
      );
      if (alive.current) setState({ data, loading: false, error: null });
    }, []),
    /**
     * Nothing comes back and nothing local changes — the password is not part of any state
     * this app holds (DEC-014: no credential survives `lib/auth.ts`, and none is created
     * here either). The caller keeps their session; the server has swapped the id underneath
     * them, which is invisible and is the point.
     *
     * The error is left to THROW rather than being folded into `state.error`: a wrong
     * current password belongs under the field that is wrong, and the card that owns the
     * form is the only thing that knows where that is (47 § States).
     */
    changePassword: useCallback(async (body: ChangePasswordBody) => {
      await apiPost<ChangePasswordBody, { ok: true }>('/profile/password', body);
    }, []),
  };
}
