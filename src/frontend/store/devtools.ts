// What Redux DevTools is shown. R-105, widened in R-504.
//
// A thunk's pending, fulfilled and rejected actions all carry its argument as `meta.arg`:
// `signIn`'s is the login form, and an RTK Query mutation's sits one level down, in
// `meta.arg.originalArgs` (the profile's password change). The action log is exactly what
// somebody screen-shares in a demo, so every key that names a password (`password`,
// `currentPassword`, `newPassword`), at any depth of the argument, is blanked before
// DevTools sees it.
//
// The store itself never holds a password: a slice does not keep a thunk's argument, and
// RTK Query keeps no argument for a mutation. This only changes the copy DevTools is shown.
//
// R-716 adds the one SECRET the store does hold, briefly: a new operator's authenticator
// link (`otpauthUrl`), kept in `state.opsTeam.created` while the owner reads the code off
// the screen. It is blanked in the action that delivers it AND in the state DevTools shows.
import type { Action } from '@reduxjs/toolkit';

type WithArg = Action & { meta?: { arg?: unknown }; payload?: unknown };

const NAMES_A_PASSWORD = /password|otpauth/i;

/** `value` with every password-named key blanked; the same object if there were none. */
function redact(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const items = value.map(redact);
    return items.some((item, index) => item !== value[index]) ? items : value;
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const next = NAMES_A_PASSWORD.test(key) ? '[redacted]' : redact(inner);
    if (next !== inner) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}

export function redactPasswords<A extends Action>(action: A): A {
  const { meta, payload } = action as WithArg;
  const arg = meta && meta.arg !== undefined ? redact(meta.arg) : undefined;
  const nextPayload = payload !== undefined ? redact(payload) : payload;
  const argChanged = meta !== undefined && meta.arg !== undefined && arg !== meta.arg;
  if (!argChanged && nextPayload === payload) return action;
  return {
    ...action,
    ...(argChanged ? { meta: { ...meta, arg } } : {}),
    ...(nextPayload !== payload ? { payload: nextPayload } : {}),
  };
}

/** The state DevTools is shown: the operator team's one-time secret blanked, nothing else
 *  touched (the rest of the store is never walked). */
export function redactSecrets<S>(state: S): S {
  const team = (state as { opsTeam?: { created?: unknown } }).opsTeam;
  if (!team?.created) return state;
  return { ...state, opsTeam: { ...team, created: redact(team.created) } };
}
