// Link 6. Works out which organisation the request belongs to, then attaches a database client locked to it.
// The organisation is never read from a body or query string - only from credentials the caller could not forge.
import type { Request, RequestHandler } from 'express';
import { resolveLabels, type LabelSet, type ResolvedLabels } from '@endur/shared';
import { AppError } from '../lib/errors.js';
import { tenantClient, type TenantClient } from '../db/tenant.js';
// One shared token-to-hash function with the activation service, so both agree what a token maps to.
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
  // Refuse when no organisation can be found. True on console routers, false on auth and respondent routes.
  required: boolean;
  // Allow the X-Org-Slug header to name the organisation. Only where the caller holds no credential yet.
  allowSlugHeader?: boolean;
};

// Builds the middleware. Each router mounts the variant its own routes need.
export function tenantResolver(opts: TenantResolverOptions): RequestHandler {
  return (req, _res, next) => {
    // Idempotent: two routers share the /campaigns prefix, and resolving twice would read the tenant twice.
    if (req.ctx.orgId) return next();

    void resolve(req, opts)
      .then(async ({ orgId, via }) => {
        if (orgId) {
          const tenant = await factsOf(orgId);
          // A suspended organisation is cut off from its own staff, but its campaigns and QR codes keep answering,
          // and an Endur support session may still come in to help.
          if (via === 'session' && tenant.suspendedAt && !isSupport(req)) {
            return next(
              new AppError('FORBIDDEN', 'This organization has been suspended. Contact Endur support.'),
            );
          }
          req.ctx.orgId = orgId;
          req.db = tenantClient(orgId);
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

// Reads the support flag straight off the session, with no database call. Safe here, because it only decides
// whether the request may continue past a suspension; on its own it grants nothing.
const isSupport = (req: Request): boolean =>
  (req as { session?: { support?: boolean } }).session?.support === true;

// The tenant facts every later link needs, in one read: permission version, labels and suspension.
async function factsOf(
  orgId: string,
): Promise<{ authzVersion: number; labels: ResolvedLabels; suspendedAt: Date | null }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    // suspendedAt rides along in a query that was happening anyway, so the check costs nothing.
    select: { settings: true, labels: true, suspendedAt: true },
  });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  return {
    authzVersion: typeof settings.authzVersion === 'number' ? settings.authzVersion : 0,
    labels: resolveLabels(org?.labels as LabelSet | null),
    suspendedAt: org?.suspendedAt ?? null,
  };
}

// Which strategy answered. 'via' is what lets a suspension stop staff without stopping respondents.
type Resolved = { orgId?: string | undefined; via?: 'activation' | 'session' | 'token' | 'slug' };

// Strict order of strategies. Each source is a credential the caller could not have forged.
async function resolve(req: Request, opts: TenantResolverOptions): Promise<Resolved> {
  // 0. Activation token in the URL. It beats a session, because somebody following an invite link has no
  //    account yet, so any session in that browser belongs to a different person.
  const activation = /^\/api\/v1\/auth\/activate\/([0-9A-Za-z]{43})(?:$|[/?])/.exec(
    req.originalUrl.split('?')[0] ?? '',
  )?.[1];
  if (activation) {
    const invite = await prisma.accountInvite.findUnique({
      where: { tokenHash: hashInviteToken(activation) },
      select: { orgId: true },
    });
    return { orgId: invite?.orgId, via: 'activation' };
  }

  // 1. API key (arrives later) and 2. the signed-in session's organisation.
  const session = (req as { session?: { orgId?: string } }).session;
  if (session?.orgId) return { orgId: session.orgId, via: 'session' };

  // 3. Respondent token in the URL. Matched against the original URL, since router middleware sees a trimmed path.
  const token = /^\/(?:r\/|api\/v1\/public\/campaigns\/)([A-Za-z0-9_-]{6,128})/.exec(
    req.originalUrl.split('?')[0] ?? '',
  )?.[1];
  if (token) {
    const campaign = await prisma.campaign.findUnique({
      where: { publicToken: token },
      select: { orgId: true },
    });
    // A bad token resolves nothing and becomes a uniform 404 later, never a hint about the token.
    return { orgId: campaign?.orgId, via: 'token' };
  }

  // 4. The X-Org-Slug header, only where the router allowed it.
  if (opts.allowSlugHeader) {
    const slug = req.get('x-org-slug');
    if (slug) {
      const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      return { orgId: org?.id, via: 'slug' };
    }
  }
  return {};
}
