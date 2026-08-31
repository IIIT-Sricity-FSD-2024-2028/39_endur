// Links 6 to 8 grouped per router: tenantResolver, authenticate and csrfProtection.
// Each router picks the chain it needs, so there are no path exception lists and an unknown URL simply 404s.
import type { RequestHandler } from 'express';
import { tenantResolver } from './tenantResolver.js';
import { authenticateOptional } from './authenticate.js';
import { csrfProtection } from './csrfProtection.js';
import { publicCors } from './security.js';

// Every console router: an organisation must resolve, or the request is refused before any handler runs.
export const tenantChain: RequestHandler[] = [
  tenantResolver({ required: true }),
  authenticateOptional,
  csrfProtection,
];

// Auth routes: no tenant yet, and the one place the X-Org-Slug header is trusted, since the caller holds no credential.
export const authChain: RequestHandler[] = [
  tenantResolver({ required: false, allowSlugHeader: true }),
  authenticateOptional,
  csrfProtection,
];

// Respondent routes: wide CORS, optional tenant, and no CSRF, because these routes carry no cookie of ours.
// For a signed-in member answering a campaign, the session cookie's sameSite=lax setting is what blocks a forged post.
export const respondentChain: RequestHandler[] = [
  publicCors,
  tenantResolver({ required: false }),
  authenticateOptional,
];

// Activation links: tenant only. No principal is attached, because any session in that browser belongs to somebody else.
export const activationChain: RequestHandler[] = [tenantResolver({ required: false })];

// Serving uploaded images: wide CORS and nothing else; the unguessable file id is the credential.
export const assetChain: RequestHandler[] = [publicCors];
