// The token resolver. 12 §4.10c, 13 §6, 39.
//
// This exists so that `requireMembership` can be a middleware rather than a line inside a
// handler, and the reason that matters is ORDER:
//
//   validate -> resolveCampaign -> requireMembership -> handler
//
// resolveCampaign 404s an invalid, unlaunched, not-yet-open, closed or expired token
// exactly as it always has, so the gate is REACHABLE ONLY WITH A WORKING TOKEN. Gating
// before resolving would turn a restricted campaign into an existence oracle: try a token,
// and a 401 instead of a 404 tells you the campaign is real. The order is the property.
//
// One query serves both routes. The GET needs the org's name and labels; the POST needs the
// subjects and questions; the union is one select, and paying for it once is cheaper than
// resolving the token twice per request.
import type { RequestHandler } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { isAccepting } from '../campaigns/status.js';

/**
 * One 404 for every reason a token might not work.
 *
 * Different messages here would turn this endpoint into an oracle: try a token, and the
 * wording tells you whether that campaign exists, whether it has launched, and whether it
 * has closed. Same object, thrown from every path.
 */
export const uniform404 = () => new NotFoundError('That link is not available.');

const campaignSelect = {
  id: true,
  orgId: true,
  name: true,
  anonymous: true,
  access: true,
  publicToken: true,
  closedAt: true,
  startsAt: true,
  endsAt: true,
  org: { select: { name: true, labels: true } },
  subjects: {
    select: { subject: { select: { id: true, name: true, archivedAt: true } } },
  },
  template: {
    select: {
      estimatedSeconds: true,
      questions: {
        orderBy: { position: 'asc' as const },
        select: {
          id: true,
          kind: true,
          text: true,
          config: true,
          required: true,
          position: true,
        },
      },
    },
  },
} satisfies Prisma.CampaignSelect;

/** What every handler behind the gate receives. Non-null: the middleware throws instead. */
export type LiveCampaign = Prisma.CampaignGetPayload<{ select: typeof campaignSelect }>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Set by resolveCampaign, read by requireMembership and by the two handlers. On the
       * request rather than on `req.ctx` because ctx is the CHAIN's object (12 §3) and this
       * is one feature's; a field on ctx would suggest every route has one.
       */
      campaign?: LiveCampaign;
    }
  }
}

export const resolveCampaign: RequestHandler = (req, _res, next) => {
  const { params } = req.data as { params: { token: string } };

  void prisma.campaign
    .findUnique({ where: { publicToken: params.token }, select: campaignSelect })
    .then((campaign) => {
      if (!campaign) throw uniform404();
      // Scheduled, closed and expired all land here, and all leave as the same 404 an
      // unknown token produces.
      if (!isAccepting(campaign)) throw uniform404();
      req.campaign = campaign;
      next();
    })
    .catch(next);
};

/** Handlers read this rather than `req.campaign!`, so a missing link is a 500 and not a crash. */
export function campaignOf(req: { campaign?: LiveCampaign }): LiveCampaign {
  if (!req.campaign) {
    // Unreachable through the router. It is here so that a future route that mounts the
    // gate without the resolver fails loudly at the seam rather than quietly letting
    // somebody in.
    throw new Error('resolveCampaign did not run before this handler');
  }
  return req.campaign;
}
