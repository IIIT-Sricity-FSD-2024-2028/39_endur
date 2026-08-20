// Link 6. Resolves orgId, then attaches the tenant-bound database client.
//
// > **orgId is NEVER read from a request body or query parameter.**
// > A body-supplied tenant is an attack, not an input. (INV-010)
//
// It runs BEFORE authenticate because an API key resolves the tenant *and* the principal,
// and the tenant-bound client must exist before any lookup can happen (12 §5).
import type { Request, RequestHandler } from 'express';
import { resolveLabels, type LabelSet, type ResolvedLabels } from '@endur/shared';
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
 * Routes that legitimately have no tenant yet: signing in, registering, health, and the
 * respondent surface. Only these may fall through to the slug header, and only these may
 * proceed without an org.
 *
 * The public routes are here for a specific reason. A VALID token resolves its campaign's
 * org above and never reaches this list; an INVALID one resolves nothing, and 401ing here
 * would answer differently from the 404 a closed campaign produces at the handler. That
 * difference is an existence oracle: try a token, and the status code tells you whether
 * that campaign exists (13 §6). Falling through lets one uniform 404 answer every case.
 */
const TENANTLESS = [
  /^\/healthz$/,
  /^\/api\/v1\/auth\//,
  /^\/api\/v1\/public\//,
];

/**
 * Only API routes need a tenant. Anything else that reaches here matched no route, so it
 * must fall through to `notFound` and leave as a 404 — demanding a tenant first would turn
 * every mistyped URL into a 401, which is a confusing answer to "that page does not exist".
 */
const NEEDS_TENANT = /^\/api\/v1\//;

export const tenantResolver: RequestHandler = (req, _res, next) => {
  void resolve(req)
    .then(async (orgId) => {
      if (orgId) {
        req.ctx.orgId = orgId;
        req.db = tenantClient(orgId);
        const tenant = await factsOf(orgId);
        req.ctx.authzVersion = tenant.authzVersion;
        req.ctx.labels = tenant.labels;
        return next();
      }
      if (!NEEDS_TENANT.test(req.path)) return next();
      if (TENANTLESS.some((pattern) => pattern.test(req.path))) return next();
      next(new AppError('UNRESOLVED_TENANT', 'No organisation could be determined.'));
    })
    .catch(next);
};

/**
 * The two tenant facts every later link needs, in ONE read.
 *
 * `authzVersion` is what makes the grant cache safe: without it the cache key is a
 * constant, and a revoked permission keeps working until the TTL expires.
 *
 * `labels` rides along because this query was already happening (T-044). 22 §6 puts the
 * label set here so the server's own user-facing strings — validation messages,
 * confirmation text, export headers — go through the same vocabulary the UI does. Adding
 * a column to a read that runs anyway is the difference between doing it and deciding it
 * costs a query per request.
 */
async function factsOf(orgId: string): Promise<{ authzVersion: number; labels: ResolvedLabels }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true, labels: true },
  });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  return {
    authzVersion: typeof settings.authzVersion === 'number' ? settings.authzVersion : 0,
    labels: resolveLabels(org?.labels as LabelSet | null),
  };
}

/** Strict priority. Each source is a credential the caller could not have forged. */
async function resolve(req: Request): Promise<string | undefined> {
  // 1 · API key  — T-007 attaches the parsed key; its org_id wins.
  // 2 · Session  — the signed-in user's orgId, set by express-session (T-007).
  const session = (req as { session?: { orgId?: string } }).session;
  if (session?.orgId) return session.orgId;

  // 3 · Respondent token — the campaign's org. The token is in the PATH, never a body.
  // The FULL prefix, including /campaigns/. The earlier pattern matched the segment after
  // /api/v1/public/ and so captured the literal word "campaigns" as the token, resolving no
  // tenant at all — invisible until the first public route existed (N-017).
  const token = /^\/(?:r\/|api\/v1\/public\/campaigns\/)([A-Za-z0-9_-]{6,128})/.exec(req.path)?.[1];
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
