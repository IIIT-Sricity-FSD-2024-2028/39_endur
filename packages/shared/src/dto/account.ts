// Account DTOs. 13 § Accounts, 57, 15 §5.
//
// The distinction the whole feature turns on, and it is worth restating where the types
// live because the two words are easy to blur:
//
//   a PERSON   a node in the graph. Holds positions, can be a reviewee, appears in a
//              list. CANNOT sign in.
//   an ACCOUNT a `users` row with a password. Can sign in. Has whatever powers their
//              positions give them, and no others (INV-005).
//
// Creating a person grants nothing. Creating an account grants nothing EITHER — it hands
// over the key to powers the positions already conferred. Separate acts, separately
// audited, which is what lets an administrator end somebody's access this morning without
// dismantling the org chart they are still in.
import { z } from 'zod';
import { dto, Id } from './common.js';

/**
 * The same floor as registration (`auth.ts`), and stated on the form BEFORE the first
 * attempt rather than after a rejected one. A rule you learn by failing is a rule that
 * costs somebody a password they had already committed to memory.
 */
export const ActivateAccountBody = z.object({
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
});
export type ActivateAccountBody = z.infer<typeof ActivateAccountBody>;

/**
 * Base62, 43 characters. Validated as a SHAPE and never looked up here — an unknown token,
 * an expired one and an already-used one all produce the same dead end (57 § Interactions),
 * so the only thing this pattern decides is whether the string is worth hashing.
 */
export const ActivationToken = z.string().regex(/^[0-9A-Za-z]{43}$/);

export const AccountIdDto = dto({ params: z.object({ id: Id }) });
export const ActivationTokenDto = dto({ params: z.object({ token: ActivationToken }) });
export const ActivateAccountDto = dto({
  body: ActivateAccountBody,
  params: z.object({ token: ActivationToken }),
});

/**
 * SHOWN ONCE. The URL is in this payload and in no table — only `sha256(token)` is stored,
 * so a second read of the provisioning route cannot return it and neither can a database
 * dump. Re-issuing is the only way back, and it invalidates the previous link.
 *
 * There is no `email` field and no mailer behind it (57 § No email). The administrator
 * copies the link and sends it however they already talk to that person; when email
 * arrives it changes one function and nothing in this type.
 */
export type AccountInvite = {
  url: string;
  expiresAt: string;
  personName: string;
};

/**
 * A DISCRIMINATED UNION, not `users.status` plus three nullable dates — for the reason
 * `14` §4 gives about `AnswerValue`. The four states have genuinely different fields, and a
 * shape that admits `{ state: 'none', lastLoginAt: '…' }` is a shape the UI has to defend
 * against on every render.
 *
 * `disabledAt` is `| null`, where 57 sketched a plain `string`. `users.disabled_at` is
 * written by the revoke path and by nothing else, so a row disabled by hand has no date —
 * and inventing `created_at` there would be a fabrication on the one line that exists to say
 * when access ended. The screen says "Disabled" without a date instead.
 *
 * The ORDER the four are tested in is a product decision and lives in ONE place,
 * `features/accounts/status.ts`. See 57 § Data contract.
 */
export type AccountStatus =
  | { state: 'none' }
  | { state: 'invited'; expiresAt: string; invitedAt: string }
  | { state: 'active'; lastLoginAt: string | null }
  | { state: 'disabled'; disabledAt: string | null };

/**
 * What `GET /auth/activate/:token` answers, and it is deliberately the smallest thing that
 * makes the screen trustworthy.
 *
 * GET BEFORE POST: the page greets the person by name and names the organisation before
 * asking for a password, because a bare password box reached from a pasted link is
 * indistinguishable from a phishing page — and this link arrives over WhatsApp.
 *
 * `labels` is not here and does not need to be: activation asks for a password and nothing
 * else, so there is no domain noun on the screen to resolve (INV-001 is satisfied by having
 * nothing to say rather than by saying it generically).
 */
export type ActivationPreview = {
  personName: string;
  organizationName: string;
  organizationLogoUrl: string | null;
  expiresAt: string;
};
