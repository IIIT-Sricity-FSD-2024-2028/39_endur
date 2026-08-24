// Auth DTOs. No Refresh — staff auth is a cookie session (DEC-014).
import { z } from 'zod';
import { dto } from './common.js';
import type { HeldCapabilities } from '../capabilities.js';
import { SIGNUP_TIERS } from '../tiers.js';

export const Credentials = z.object({
  email: z.string().email().max(200),
  // Long minimum, no composition rules. Length beats character classes, and a rule that
  // forces a symbol mostly produces "Password1!" everywhere.
  password: z.string().min(10).max(200),
});

/**
 * `orgId` IS THE ANSWER TO A QUESTION, NOT A HINT — DEC-049, and it is optional because it
 * is only ever supplied on the SECOND attempt.
 *
 * `users` is unique on `(org_id, email)` (`10` §3), so one address can hold an activated
 * account in more than one organisation. `15` §2 defines login as email + password with no
 * organisation, which is right for the overwhelmingly common case and cannot be right for
 * that one. First attempt: no `orgId`, and the server answers with a `409
 * ACCOUNT_AMBIGUOUS` naming the organisations if — and only if — the password opens more
 * than one. Second attempt: the same credentials plus the chosen `orgId`.
 *
 * It is NOT a way to pick which account to try. The password is verified against the
 * organisation named here and nowhere else, so a wrong `orgId` fails exactly like a wrong
 * password, with the same message. Sending one cannot make a login succeed that would
 * otherwise have failed.
 */
export const LoginBody = Credentials.extend({
  orgId: z.string().uuid().optional(),
});
export type LoginBody = z.infer<typeof LoginBody>;

/** The 409 body's `details`. Only ever sent to a caller who has just proved the password. */
export type AmbiguousAccounts = { organizations: Array<{ id: string; name: string }> };

/**
 * Registration creates the ORGANISATION and its first user in one transaction.
 *
 * `tier` IS REQUIRED AND HAS NO DEFAULT — that is `DEC-048`, and the absence of `.default()`
 * is the whole of it. The owner's instruction was *"pick the option and you get assigned
 * that"*, so there is nothing to fall through to: a registration that names no tier is an
 * incomplete registration and `validate()` refuses it with a field error. A default here
 * would silently re-create `D-012` — every organisation quietly on the same tier, chosen by
 * nobody — which is the exact bug this DTO change exists to close.
 *
 * `industry` KEEPS its default for the opposite reason (CONF-011): `/start` deliberately does
 * not ask, because the wizard's step 1 asks properly with each preset's contents visible.
 * Nobody answers `industry` twice; everybody answers `tier` once.
 */
export const RegisterBody = Credentials.extend({
  name: z.string().min(1).max(120),
  orgName: z.string().min(1).max(120),
  industry: z.enum(['university', 'hotel', 'hospital', 'company', 'custom']).default('custom'),
  /** Bronze, Silver or Gold. Enterprise is operator-assigned and not on the picker (16 §4). */
  tier: z.enum(SIGNUP_TIERS),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginDto = dto({ body: LoginBody });
export const RegisterDto = dto({ body: RegisterBody });

/**
 * The ONLY boot call (13 § Auth). Session, org, vocabulary and the caller's capability
 * set arrive together so the SPA's first paint is already correct — right domain nouns,
 * right actions — rather than flashing generic words and then re-rendering.
 */
export type MeResponse = {
  /** `avatarUrl` rides along for the same reason the labels do: the shell renders the
   *  signed-in user on its first paint, and a second request for one image would flash. */
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  organization: { id: string; name: string; slug: string; industry: string };
  labels: Record<string, { one: string; many: string }>;
  /**
   * What the UI may OFFER, never what the caller may DO (INV-003). Authorisation is
   * decided by requireCapability() on every route; this map only decides which buttons
   * are worth rendering. See the backend's authz/held.ts for how it is derived and what
   * it deliberately approximates.
   *
   * A MAP, NOT A LIST, SINCE T-086 — capability to the widest scope it is held at. The
   * verb alone could not answer the only question the sidebar actually asks: not *"does
   * this person hold `person.read`"* (everybody does, at `self`, by seed) but *"does it
   * reach past themselves"*. Keys are sorted, so a diff between two callers is readable.
   */
  capabilities: HeldCapabilities;
};
