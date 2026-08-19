// The public campaign token. DEC-017, 38.
//
// Eight characters from a 31-character alphabet with 0, O, 1, I and L removed: roughly 40
// bits, and readable aloud without spelling corrections. That second property is not
// decoration — during the demo somebody reads this URL out to a room.
//
// Doc 38 originally asked for six characters. Six of this alphabet is about 30 bits, which
// is guessable often enough to matter for a link that needs no credential at all, and
// tenantResolver's path pattern already required eight. DEC-017 settles it at eight.
import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 8;

export function mintToken(): string {
  let token = '';
  for (let index = 0; index < LENGTH; index += 1) {
    // randomInt, not Math.random. This value is the ONLY thing standing between a stranger
    // and a campaign's form, so it comes from the CSPRNG.
    token += ALPHABET[randomInt(ALPHABET.length)];
  }
  return token;
}

export const publicUrlFor = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/r/${token}`;
