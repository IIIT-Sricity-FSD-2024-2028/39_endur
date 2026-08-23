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
// ONE definition of token -> hash, shared with the activation service. A second sha256
// here would be a second mapping, and a disagreement would show up as a link that
// resolves no tenant rather than as an error anybody could see.
import { hashInviteToken } from '../auth/inviteToken.js';
import { prisma } from '../db/client.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      db: TenantClient;
    }
  }
}

export type TenantResolverOptions = {
  /**
   * Fail closed when no organisation can be resolved. True on every tenant router; false
   * on auth (signing in has no tenant yet) and on the respondent surface.
   *
   * The respondent surface is false for a specific reason. A VALID token resolves its
   * campaign's org and never reaches the decision; an INVALID one resolves nothing, and
   * 401ing here would answer differently from the 404 a closed campaign produces at the
   * handler. That difference is an existence oracle: try a token, and the status code
   * tells you whether that campaign exists (13 §6). Falling through lets one uniform 404
   * answer every case.
   */
  required: boolean;
  /**
   * Allow `X-Org-Slug` to name the tenant. ONLY on routes where the caller holds no
   * credential — otherwise a header could widen the access of someone who already has one.
   *
   * This used to be a path regex (`TENANTLESS`) tested inside the resolver. It is an
   * option now because the resolver became router-level (T-064, D-017): the router that
   * mounts it knows whether its routes are credential-free, and a mount point is a much
   * harder thing to get wrong than a regex that has to be kept in step with app.ts.
   */
  allowSlugHeader?: boolean;
};

/**
 * Link 6, as a factory. Router-level: each router mounts the variant its routes need
 * (12 §2's per-router box, made true by T-064).
 */
export function tenantResolver(opts: TenantResolverOptions): RequestHandler {
  return (req, _res, next) => {
    // Idempotent. `resultsRouter` and `campaignsRouter` share the `/campaigns` prefix, so
    // a results request runs both chains; resolving twice would double the tenant read for
    // no benefit.
    if (req.ctx.orgId) return next();

    void resolve(req, opts)
      .then(async (orgId) => {
        if (orgId) {
          req.ctx.orgId = orgId;
          req.db = tenantClient(orgId);
          const tenant = await factsOf(orgId);
          req.ctx.authzVersion = tenant.authzVersion;
          req.ctx.labels = tenant.labels;
          return next();
        }
        if (!opts.required) return next();
        next(new AppError('UNRESOLVED_TENANT', 'No organisation could be determined.'));
      })
      .catch(next);
  };
}

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
async function resolve(req: Request, opts: TenantResolverOptions): Promise<string | undefined> {
  // 0 · ACTIVATION TOKEN — /api/v1/auth/activate/:token (57). THE ONE STRATEGY THAT
  //     OUTRANKS A SESSION, and it needs the argument spelled out because "strict priority"
  //     is otherwise the whole rule.
  //
  //     Every other strategy answers "who is calling". This route is different: the person
  //     following an activation link HAS NO ACCOUNT — that is the entire situation — so any
  //     session in the browser belongs to somebody else, quite possibly in a different
  //     organisation. Letting it win would file org B's activation under org A's audit log.
  //     The token is in the PATH, is unforgeable, and is what the request is ABOUT.
  //
  //     An unknown token resolves no tenant and becomes the same uniform dead end the
  //     handler produces anyway — never a hint that the token was nearly right.
  const activation = /^\/api\/v1\/auth\/activate\/([0-9A-Za-z]{43})(?:$|[/?])/.exec(
    req.originalUrl.split('?')[0] ?? '',
  )?.[1];
  if (activation) {
    const invite = await prisma.accountInvite.findUnique({
      where: { tokenHash: hashInviteToken(activation) },
      select: { orgId: true },
    });
    return invite?.orgId;
  }

  // 1 · API key  — T-007 attaches the parsed key; its org_id wins.
  // 2 · Session  — the signed-in user's orgId, set by express-session (T-007).
  const session = (req as { session?: { orgId?: string } }).session;
  if (session?.orgId) return session.orgId;

  // 3 · Respondent token — the campaign's org. The token is in the PATH, never a body.
  // The FULL prefix, including /campaigns/. The earlier pattern matched the segment after
  // /api/v1/public/ and so captured the literal word "campaigns" as the token, resolving no
  // tenant at all — invisible until the first public route existed (N-017).
  // Matched against the ORIGINAL url, not req.path: router-level middleware sees a path
  // relative to its mount point, so `/api/v1/public/campaigns/<token>` arrives here as
  // `/campaigns/<token>` and the full-prefix pattern would never match (T-064).
  const token = /^\/(?:r\/|api\/v1\/public\/campaigns\/)([A-Za-z0-9_-]{6,128})/.exec(
    req.originalUrl.split('?')[0] ?? '',
  )?.[1];
  if (token) {
    const campaign = await prisma.campaign.findUnique({
      where: { publicToken: token },
      select: { orgId: true },
    });
    // A bad token resolves to nothing here and becomes a uniform 404 later (13 §6) —
    // never a "wrong organisation" hint that would confirm the token's shape.
    return campaign?.orgId;
  }

  // 4 · Slug header — ONLY where the router said so, so it can never widen the access of
  //     a caller who already has a credential.
  if (opts.allowSlugHeader) {
    const slug = req.get('x-org-slug');
    if (slug) {
      const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      return org?.id;
    }
  }
  return undefined;
}
