// Auth DTOs. No Refresh — staff auth is a cookie session (DEC-014).
import { z } from 'zod';
import { dto } from './common.js';
import type { Capability } from '../capabilities.js';

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

/**
 * The ONLY boot call (13 § Auth). Session, org, vocabulary and the caller's capability
 * set arrive together so the SPA's first paint is already correct — right domain nouns,
 * right actions — rather than flashing generic words and then re-rendering.
 */
export type MeResponse = {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string; industry: string };
  labels: Record<string, { one: string; many: string }>;
  /**
   * What the UI may OFFER, never what the caller may DO (INV-003). Authorisation is
   * decided by requireCapability() on every route; this list only decides which buttons
   * are worth rendering. See the backend's authz/held.ts for how it is derived and what
   * it deliberately approximates.
   */
  capabilities: Capability[];
};
