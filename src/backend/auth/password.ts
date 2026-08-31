// Password hashing with argon2id, which is memory-hard, so a stolen password table is slow to crack.
import argon2 from 'argon2';

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP's current floor
  timeCost: 2,
  parallelism: 1,
} as const;

// Turns a plain password into the hash we store in the database.
export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, OPTIONS);

// Checks a plain password against the stored hash and returns true only if they match.
export async function verifyPassword(hash: string | null, plain: string): Promise<boolean> {
  // No hash means the invite was never activated. Hash anyway, so timing cannot reveal who exists.
  if (!hash) {
    await argon2.hash(plain, OPTIONS);
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
