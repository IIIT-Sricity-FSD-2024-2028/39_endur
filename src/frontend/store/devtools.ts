// What Redux DevTools is shown. R-105, widened in R-504.
//
// A thunk's pending, fulfilled and rejected actions all carry its argument as `meta.arg`:
// `signIn`'s is the login form, and an RTK Query mutation's sits one level down, in
// `meta.arg.originalArgs` (the profile's password change). The action log is exactly what
// somebody screen-shares in a demo, so every key that names a password (`password`,
// `currentPassword`, `newPassword`), at any depth of the argument, is blanked before
// DevTools sees it.
//
// The store itself never holds any of these: a slice does not keep a thunk's argument, and
// RTK Query keeps no argument for a mutation. This only changes the copy DevTools is shown.
import type { Action } from '@reduxjs/toolkit';

type WithArg = Action & { meta?: { arg?: unknown } };

const NAMES_A_PASSWORD = /password/i;

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
  const { meta } = action as WithArg;
  if (!meta || meta.arg === undefined) return action;
  const arg = redact(meta.arg);
  return arg === meta.arg ? action : { ...action, meta: { ...meta, arg } };
}
