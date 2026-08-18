// argon2id. Chosen over bcrypt because it is memory-hard: a GPU farm gets far less
// advantage per rupee, which is the entire threat model for a leaked password table.
import argon2 from 'argon2';

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP's current floor
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, OPTIONS);

export async function verifyPassword(hash: string | null, plain: string): Promise<boolean> {
  // An unactivated invite has no hash. Still spend the time: returning instantly would
  // tell an attacker which addresses exist, which is the timing half of user enumeration.
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
