// The activation token. 15 §3, 57 § The token.
//
// IN `auth/` RATHER THAN IN `features/accounts/`, which is where 57's Owns line puts it,
// and the move is not tidying. `middleware/tenantResolver.ts` has to hash an activation
// token to find its organisation (strategy 0), and middleware importing from a feature is
// the dependency arrow pointing the wrong way. Leaving it in the feature would have meant
// a second sha256 in the resolver — two definitions of one mapping, where the failure mode
// of a disagreement is a link that silently resolves no tenant.
//
// `auth/` is the right home on its own terms: it already holds password.ts and session.ts,
// the other two credential primitives, and 15 §3 is the document that specifies tokens.
//
// Same construction as the campaign token (features/campaigns/token.ts) and for the same
// reason — it is the ONLY thing standing between a stranger and somebody's account — but
// deliberately not the same function, because the two answer different questions:
//
//   campaign token  8 characters, READ ALOUD TO A ROOM. Its alphabet drops 0/O/1/I/L so
//                   nobody has to spell it, and ~40 bits is right for a link that opens a
//                   feedback form.
//   this token      43 characters, PASTED. Nobody reads it aloud, so legibility buys
//                   nothing and entropy is the only property that matters.
//
// Sharing one function would have meant one of those two being wrong.
import { createHash, randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const LENGTH = 43;

/**
 * ~256 bits: 43 characters of base62 is log2(62) × 43 ≈ 256, which is what `57` means by
 * "32 bytes". Base62 rather than base64url so the string survives every place a person
 * might paste it — a chat client that treats `_` as italics, a spreadsheet cell, a URL
 * shortener — without a character having to be escaped or a link breaking in half.
 *
 * `randomInt` is the CSPRNG. Rejection sampling is inside it, so 62 not dividing 256 costs
 * nothing and introduces no modulo bias.
 */
export function mintInviteToken(): string {
  let token = '';
  for (let index = 0; index < LENGTH; index += 1) token += ALPHABET[randomInt(ALPHABET.length)];
  return token;
}

/**
 * SHA-256, hex. Not argon2, and the difference from `auth/password.ts` is the point:
 *
 *   a password  is chosen by a human, is low-entropy, and must survive a stolen database
 *               being ground through a GPU for a month. That needs a slow KDF.
 *   this token  is 256 bits from a CSPRNG. There is nothing to grind — the search space IS
 *               the security — so the hash only has to be one-way, and it has to be FAST
 *               because it runs on every activation request including the rate-limited
 *               failures.
 *
 * What the hash buys is the same thing it buys for `api_keys` (10 §5): a database dump
 * contains no working links, and neither does a support engineer's screen.
 */
export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * `/activate/<token>` — in the PUBLIC route tree beside `/login`, not the console (57
 * § Route & access). The person following it has no session by definition, and
 * `<ConsoleLayout>` would bounce them to `/login` before the page ever rendered.
 */
export const activationUrlFor = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/activate/${token}`;

/** 7 days: long enough to survive a weekend, short enough that a group chat goes stale. */
export const INVITE_TTL_DAYS = 7;

export const expiryFrom = (now: Date): Date =>
  new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
