// Activation tokens for invite links - how an invited staff member first opens their account.
import { createHash, randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const LENGTH = 43;

// Makes one fresh random token, 43 characters (about 256 bits) and safe to paste anywhere.
export function mintInviteToken(): string {
  let token = '';
  for (let index = 0; index < LENGTH; index += 1) token += ALPHABET[randomInt(ALPHABET.length)];
  return token;
}

// Hashes a token with SHA-256, so the database holds the hash and never a working link.
export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

// Builds the /activate/<token> link that is sent to the invited person.
export const activationUrlFor = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/activate/${token}`;

// Invites last 7 days: long enough to survive a weekend, short enough to go stale.
export const INVITE_TTL_DAYS = 7;

// Works out when a token minted now should expire.
export const expiryFrom = (now: Date): Date =>
  new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
