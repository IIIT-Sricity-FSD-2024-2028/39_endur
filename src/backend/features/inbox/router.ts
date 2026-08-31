// Inbox routes.
// The comment routes carry response.read and nothing else: marking your own inbox needs no capability,
// because the state is one row per (user, response), so two people triaging the same campaign never clash.
import { Router } from 'express';
import {
  InboxListDto,
  InboxMarkDto,
  InboxMessageListDto,
  InboxMessageMarkDto,
} from '@endur/shared';
import type { InboxMessageQuery, InboxQuery } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { mark, markMessage, readInbox, readMessages } from './service.js';

export const inboxRouter: Router = Router();

inboxRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

// The comment queue, filtered by tab: all, unread or archived.
inboxRouter.get(
  '/',
  authenticate,
  validate(InboxListDto),
  requireCapability('response.read', { target: 'any' }),
  (req, res, next) => {
    const { query } = req.data as { query: InboxQuery };
    void Promise.resolve()
      .then(() => readInbox(req.ctx.orgId as string, userOf(req), version(req), query))
      .then((page) => res.json(page))
      .catch(next);
  },
);

// Four verbs rather than one PATCH with a body: they are four distinct things a person does to a card,
// and POST /read reads clearly in a log where PATCH {read:true,archived:false} does not.
for (const action of ['read', 'unread', 'archive', 'unarchive'] as const) {
  inboxRouter.post(
    `/:responseId/${action}`,
    authenticate,
    validate(InboxMarkDto),
    requireCapability('response.read', { target: 'any' }),
    (req, res, next) => {
      const { params } = req.data as { params: { responseId: string } };
      void Promise.resolve()
        .then(() =>
          mark(req.ctx.orgId as string, userOf(req), version(req), params.responseId, action),
        )
        // 204: there is no body worth sending, and the card already updated optimistically.
        .then(() => res.status(204).end())
        .catch(next);
    },
  );
}

// Messages from Endur.
// No capability on these two, deliberately: response.read decides which units' responses you may see,
// and has nothing to say about a message addressed to you by name. The row names the reader, and the
// service scopes every query by the signed-in user, which is where that is enforced.

// Messages sent to this user by Endur.
inboxRouter.get('/messages', authenticate, validate(InboxMessageListDto), (req, res, next) => {
  const { query } = req.data as { query: InboxMessageQuery };
  void readMessages(req.ctx.orgId as string, userOf(req), query)
    .then((page) => res.json(page))
    .catch(next);
});

// Two verbs, not one PATCH with a body - the same argument as the four above.
for (const action of ['read', 'unread'] as const) {
  inboxRouter.post(
    `/messages/:id/${action}`,
    authenticate,
    validate(InboxMessageMarkDto),
    (req, res, next) => {
      const { params } = req.data as { params: { id: string } };
      void markMessage(req.ctx.orgId as string, userOf(req), params.id, action)
        .then(() => res.status(204).end())
        .catch(next);
    },
  );
}

