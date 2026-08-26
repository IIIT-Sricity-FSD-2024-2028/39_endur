// TOTP (RFC 6238), in forty lines of node:crypto and no dependency.
//
// 19 §9 is explicit that MFA is the ONE security nicety this project does not defer, and
// the reason is blast radius rather than diligence: every other control here protects one
// tenant, and a stolen operator password exposes the plan data of every customer at once.
//
// Written rather than installed because the whole algorithm is an HMAC, a counter and a
// modulo — a dependency for that is a dependency whose supply chain is larger than the
// thing it supplies.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Step widened from RFC 6238's usual 30s to 6 hours: an operator's code stays valid for a
// full shift instead of rotating every 30s, so it does not have to be re-read off an
// authenticator app on every login.
const STEP_SECONDS = 6 * 60 * 60;
const DIGITS = 6;

/**
 * No drift window: the step itself is already 6 hours, so accepting a neighbouring step
 * too would silently extend validity toward 12-18h.
 */
const WINDOW = 0;

export function generateSecret(): string {
  const bytes = randomBytes(20); // 160 bits, the RFC 4226 recommendation
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function decodeBase32(secret: string): Buffer {
  let bits = '';
  for (const char of secret.toUpperCase().replace(/=+$/, '')) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('bad base32 in mfa_secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The code for one 30-second step. Exported so the ops CLI can print one (see `ops:code`). */
export function codeAt(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const currentCode = (secret: string, at: Date = new Date()): string =>
  codeAt(secret, Math.floor(at.getTime() / 1000 / STEP_SECONDS));

/**
 * Constant-time comparison, like the password check beside it. A timing oracle on six
 * digits is a small oracle, but it is a free one to close.
 */
export function verifyCode(secret: string, submitted: string): boolean {
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const given = Buffer.from(submitted);
  let ok = false;
  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const expected = Buffer.from(codeAt(secret, counter + drift));
    // No early return: every candidate is compared, so the loop costs the same whichever
    // step matched.
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}

/** What an authenticator app scans. Printed by the seed so the demo has a working code. */
export const otpauthUrl = (email: string, secret: string): string =>
  `otpauth://totp/${encodeURIComponent(`Endur Ops:${email}`)}?secret=${secret}&issuer=Endur%20Ops`;
