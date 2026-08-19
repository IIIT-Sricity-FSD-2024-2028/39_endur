// Link 6. Resolves orgId, then attaches the tenant-bound database client.
//
// > **orgId is NEVER read from a request body or query parameter.**
// > A body-supplied tenant is an attack, not an input. (INV-010)
//
// It runs BEFORE authenticate because an API key resolves the tenant *and* the principal,
// and the tenant-bound client must exist before any lookup can happen (12 §5).
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { tenantClient, type TenantClient } from '../db/tenant.js';
import { prisma } from '../db/client.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      db: TenantClient;
    }
  }
}

/**
<<<<<<< HEAD
 * Routes that legitimately have no tenant yet: signing in, registering, health. Only these
 * may fall through to the slug header, and only these may proceed without an org.
=======
 * Routes that legitimately have no tenant yet: signing in, registering, health, and the
 * respondent surface. Only these may fall through to the slug header, and only these may
 * proceed without an org.
 *
 * The public routes are here for a specific reason. A VALID token resolves its campaign's
 * org above and never reaches this list; an INVALID one resolves nothing, and 401ing here
 * would answer differently from the 404 a closed campaign produces at the handler. That
 * difference is an existence oracle: try a token, and the status code tells you whether
 * that campaign exists (13 §6). Falling through lets one uniform 404 answer every case.
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
 */
const TENANTLESS = [
  /^\/healthz$/,
  /^\/api\/v1\/auth\//,
<<<<<<< HEAD
  /^\/api\/v1\/_echo$/, // temporary pipe probe, deleted at T-015
=======
  /^\/api\/v1\/public\//,
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
];

/**
 * Only API routes need a tenant. Anything else that reaches here matched no route, so it
 * must fall through to `notFound` and leave as a 404 — demanding a tenant first would turn
 * every mistyped URL into a 401, which is a confusing answer to "that page does not exist".
 */
const NEEDS_TENANT = /^\/api\/v1\//;

export const tenantResolver: RequestHandler = (req, _res, next) => {
  void resolve(req)
<<<<<<< HEAD
    .then((orgId) => {
      if (orgId) {
        req.ctx.orgId = orgId;
        req.db = tenantClient(orgId);
=======
    .then(async (orgId) => {
      if (orgId) {
        req.ctx.orgId = orgId;
        req.db = tenantClient(orgId);
        req.ctx.authzVersion = await authzVersionOf(orgId);
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
        return next();
      }
      if (!NEEDS_TENANT.test(req.path)) return next();
      if (TENANTLESS.some((pattern) => pattern.test(req.path))) return next();
      next(new AppError('UNRESOLVED_TENANT', 'No organisation could be determined.'));
    })
    .catch(next);
};

<<<<<<< HEAD
=======
/**
 * The tenant's current authz version. One small read per authenticated request, and it is
 * what makes the grant cache safe: without it the cache key is a constant, and a revoked
 * permission keeps working until the TTL expires.
 */
async function authzVersionOf(orgId: string): Promise<number> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  return typeof settings.authzVersion === 'number' ? settings.authzVersion : 0;
}

>>>>>>> 95a69183487c1f29e2422c760433704d08948484
/** Strict priority. Each source is a credential the caller could not have forged. */
async function resolve(req: Request): Promise<string | undefined> {
  // 1 · API key  — T-007 attaches the parsed key; its org_id wins.
  // 2 · Session  — the signed-in user's orgId, set by express-session (T-007).
  const session = (req as { session?: { orgId?: string } }).session;
  if (session?.orgId) return session.orgId;

  // 3 · Respondent token — the campaign's org. The token is in the PATH, never a body.
<<<<<<< HEAD
  const token = /^\/(?:r|api\/v1\/public)\/([A-Za-z0-9_-]{8,128})\b/.exec(req.path)?.[1];
=======
  // The FULL prefix, including /campaigns/. The earlier pattern matched the segment after
  // /api/v1/public/ and so captured the literal word "campaigns" as the token, resolving no
  // tenant at all — invisible until the first public route existed (N-017).
  const token = /^\/(?:r\/|api\/v1\/public\/campaigns\/)([A-Za-z0-9_-]{6,128})/.exec(req.path)?.[1];
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
  if (token) {
    const campaign = await prisma.campaign.findUnique({
      where: { publicToken: token },
      select: { orgId: true },
    });
    // A bad token resolves to nothing here and becomes a uniform 404 later (13 §6) —
    // never a "wrong organisation" hint that would confirm the token's shape.
    return campaign?.orgId;
  }

  // 4 · Slug header — ONLY on unauthenticated routes, so it can never widen the access of
  //     a caller who already has a credential.
  if (TENANTLESS.some((pattern) => pattern.test(req.path))) {
    const slug = req.get('x-org-slug');
    if (slug) {
      const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      return org?.id;
    }
  }
  return undefined;
}
