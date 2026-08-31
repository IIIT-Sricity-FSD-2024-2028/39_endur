// Turns a public token into the campaign behind it, as middleware.
// The order matters: validate, resolve, then the membership gate. Resolving first means the gate is only
// reached with a working token, so a refusal can never reveal whether a campaign exists.
// One query serves both routes, so a request never resolves the same token twice.
import type { RequestHandler } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { isAccepting } from '../campaigns/status.js';
import {
  resolveBookable as resolveBookableByToken,
  type LiveBookable,
} from '../booking/service.js';

// One 404 for every reason a token might not work, so the wording can never tell a probe anything.
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

// What every handler behind the gate receives. Never null: the middleware throws instead.
export type LiveCampaign = Prisma.CampaignGetPayload<{ select: typeof campaignSelect }>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Set by resolveCampaign, read by the gate and the handlers. On the request rather than ctx,
      // because ctx belongs to the middleware chain and this belongs to one feature.
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
      // Scheduled, closed and expired all leave as the same 404 an unknown token gets.
      if (!isAccepting(campaign)) throw uniform404();
      req.campaign = campaign;
      next();
    })
    .catch(next);
};

// Handlers call this instead of reaching for the field directly, so a missing link fails at the seam.
export function campaignOf(req: { campaign?: LiveCampaign }): LiveCampaign {
  if (!req.campaign) {
    // Unreachable through the router; here so a future route that forgets the resolver fails loudly.
    throw new Error('resolveCampaign did not run before this handler');
  }
  return req.campaign;
}


// The same shape for a BOOKABLE token, deliberately.
// A booking link has the same properties as a feedback link, so it gets the same middleware order,
// which keeps that order visible to whoever adds a gate later.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Set by resolveBookable, read by the three public booking handlers.
      bookable?: LiveBookable;
    }
  }
}

// Unknown, unopened and closed all leave as the same 404, so one sentence covers every reason a link fails.
export const resolveBookable: RequestHandler = (req, _res, next) => {
  const { params } = req.data as { params: { token: string } };
  void resolveBookableByToken(params.token)
    .then((bookable) => {
      req.bookable = bookable;
      next();
    })
    .catch(next);
};

// As campaignOf: a missing link is a failure at the seam, never a crash inside a handler.
export function bookableOf(req: { bookable?: LiveBookable }): LiveBookable {
  if (!req.bookable) throw new Error('resolveBookable did not run before this handler');
  return req.bookable;
}
