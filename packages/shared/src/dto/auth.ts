// Auth DTOs. No Refresh — staff auth is a cookie session (DEC-014).
import { z } from 'zod';
import { dto } from './common.js';

export const Credentials = z.object({
  email: z.string().email().max(200),
  // Long minimum, no composition rules. Length beats character classes, and a rule that
  // forces a symbol mostly produces "Password1!" everywhere.
  password: z.string().min(10).max(200),
});

export const LoginBody = Credentials;
export type LoginBody = z.infer<typeof LoginBody>;

/** Registration creates the ORGANISATION and its first user in one transaction. */
export const RegisterBody = Credentials.extend({
  name: z.string().min(1).max(120),
  orgName: z.string().min(1).max(120),
  industry: z.enum(['university', 'hotel', 'hospital', 'company', 'custom']).default('custom'),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginDto = dto({ body: LoginBody });
export const RegisterDto = dto({ body: RegisterBody });

export type MeResponse = {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string; industry: string };
  labels: Record<string, { one: string; many: string }>;
};
