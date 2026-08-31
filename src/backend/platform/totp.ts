// Two-factor codes (TOTP) for operator login, written with node:crypto rather than a dependency.
// Operator accounts reach every customer's plan data, so this is the one security extra not deferred.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// The step is 5 hours rather than the usual 30 seconds, to keep the seed and demo flow workable.
const STEP_SECONDS = 5 * 60 * 60;
const DIGITS = 6;

// No drift allowance: with a 5-hour step, accepting the neighbouring steps would extend validity again.
const WINDOW = 0;

// Makes a new base32 secret for an operator.
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

// Decodes a base32 secret back into bytes.
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

// The code for one time step. Exported so the ops CLI can print one.
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

// The code that is valid right now.
export const currentCode = (secret: string, at: Date = new Date()): string =>
  codeAt(secret, Math.floor(at.getTime() / 1000 / STEP_SECONDS));

// Constant-time comparison, so the six digits cannot be guessed from response timing.
export function verifyCode(secret: string, submitted: string): boolean {
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const given = Buffer.from(submitted);
  let ok = false;
  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const expected = Buffer.from(codeAt(secret, counter + drift));
    // No early return: every candidate is compared, so the loop costs the same either way.
    if (expected.length === given.length && timingSafeEqual(expected, given)) ok = true;
  }
  return ok;
}

// The otpauth:// URL an authenticator app scans. Printed by the seed so the demo has a working code.
export const otpauthUrl = (email: string, secret: string): string =>
  `otpauth://totp/${encodeURIComponent(`Endur Ops:${email}`)}?secret=${secret}&issuer=Endur%20Ops`;
