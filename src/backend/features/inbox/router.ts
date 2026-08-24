// Inbox routes. 13 § Inbox, 58.
//
// All five carry `response.read` and nothing else. Marking your own inbox needs no
// capability beyond seeing it, which is why there is no `inbox.*` module in `11` §3: the
// state is one row per (user, response), so two administrators triaging the same campaign
// never overwrite each other. A capability would imply a shared queue somebody can be
// excluded from, and there is no such thing here.
import { Router } from 'express';
import { InboxListDto, InboxMarkDto } from '@endur/shared';
import type { InboxQuery } from '@endur/shared';
import { tenantChain } from '../../middleware/chains.js';
import { validate } from '../../middleware/validate.js';
import { requireCapability } from '../../middleware/requireCapability.js';
import { authenticate } from '../../middleware/authenticate.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { mark, readInbox } from './service.js';

export const inboxRouter: Router = Router();

inboxRouter.use(tenantChain);

const userOf = (req: { ctx: { principal?: { kind: string; id?: string } } }): string => {
  const principal = req.ctx.principal;
  if (principal?.kind !== 'user' || !principal.id) throw new UnauthenticatedError();
  return principal.id;
};

const version = (req: { ctx: { authzVersion?: number } }) => req.ctx.authzVersion ?? 0;

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

// Four verbs rather than one PATCH with a body. They are four distinct things a person
// does to a card, each is a single click, and `POST /read` in a log is legible in a way
// that `PATCH {read:true,archived:false}` is not (13 § Inbox names them individually).
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
        // 204. There is no body worth sending: the client already knows what it asked for,
        // and the card updated optimistically before the request left (58 § State).
        .then(() => res.status(204).end())
        .catch(next);
    },
  );
}
