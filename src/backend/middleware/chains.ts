// Links 6–8 as ROUTER-LEVEL middleware. 12 §2's middle box, made true.
//
// `12` §2 has always drawn tenantResolver, authenticate and csrfProtection inside a
// `per-router` box, and app.ts has always mounted all three with `app.use()`. That gap was
// `D-017`: the diagram was wrong, and it was describing the better answer.
//
// Why router-level is genuinely better here, and not just rubric-shaped:
//
//   1 · The exception lists disappear. tenantResolver used to carry two path regexes —
//       "which routes may have no tenant" and "which routes may use the slug header" —
//       that had to be kept in step with app.ts by hand. The mount point knows both
//       facts already. A router cannot forget to be in a list it is not in.
//
//   2 · A mistyped API path now 404s. With a global resolver, /api/v1/nonsense matched
//       NEEDS_TENANT and answered 401 UNRESOLVED_TENANT — a confusing reply to "that
//       route does not exist". Unmatched paths now reach notFound.
//
//   3 · The respondent surface stops being an exception carved out of the console's
//       chain and becomes its own chain, which is what 13 §6 and DEC-009 always said it
//       was.
//
// Application-level middleware (links 0–5) stays in app.ts, because it genuinely applies
// to every request including /healthz. The two kinds sit side by side on purpose.
import type { RequestHandler } from 'express';
import { tenantResolver } from './tenantResolver.js';
import { authenticateOptional } from './authenticate.js';
import { csrfProtection } from './csrfProtection.js';
import { publicCors } from './security.js';

/**
 * Every console router. A request with no resolvable organisation is refused here, before
 * a single handler runs — which is why no service has to ask "what if there is no org?".
 */
export const tenantChain: RequestHandler[] = [
  tenantResolver({ required: true }),
  authenticateOptional,
  csrfProtection,
];

/**
 * Auth only. Signing in and registering have no tenant yet by definition, and they are the
 * one place `X-Org-Slug` is honoured — the caller holds no credential, so a header cannot
 * widen anything.
 */
export const authChain: RequestHandler[] = [
  tenantResolver({ required: false, allowSlugHeader: true }),
  authenticateOptional,
  csrfProtection,
];

/**
 * The respondent surface (13 §6, DEC-009). Its own CORS policy, its own tenant rule, and
 * deliberately NO csrfProtection: these routes take no credential, are open to every
 * origin by design, and a forged cross-site POST can do nothing an attacker could not do
 * with curl. CSRF exists to stop a browser using ambient authority; there is none here.
 */
export const respondentChain: RequestHandler[] = [
  publicCors,
  tenantResolver({ required: false }),
  authenticateOptional,
];

/**
 * Serving uploaded images (`48`). The shortest chain here: wide CORS and nothing else.
 *
 * No tenant, because a logo renders on a respondent's phone, which has no session and no
 * organisation. No principal and no CSRF, for the same reason. The unguessable file id is
 * the credential, and the only two kinds of file that exist are logos and avatars — both of
 * which are shown to everyone who can see the page they sit on.
 */
export const assetChain: RequestHandler[] = [publicCors];
