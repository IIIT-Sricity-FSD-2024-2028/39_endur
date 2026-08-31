// The public campaign token that goes in a link and a QR code.
// Eight characters from an alphabet with 0, O, 1, I and L removed: about 40 bits, and readable aloud
// without spelling corrections, because somebody reads this URL out to a room.
import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 8;

// Mints one token.
export function mintToken(): string {
  let token = '';
  for (let index = 0; index < LENGTH; index += 1) {
    // From the crypto random source, not Math.random: this value is all that stands between a stranger and the form.
    token += ALPHABET[randomInt(ALPHABET.length)];
  }
  return token;
}

// The full public URL for a token.
export const publicUrlFor = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/r/${token}`;
