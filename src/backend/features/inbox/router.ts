// Inbox routes. 13 § Inbox, 58.
//
// The five COMMENT routes carry `response.read` and nothing else. Marking your own inbox needs no
// capability beyond seeing it, which is why there is no `inbox.*` module in `11` §3: the
// state is one row per (user, response), so two administrators triaging the same campaign
// never overwrite each other. A capability would imply a shared queue somebody can be
// excluded from, and there is no such thing here.
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

// ---------------------------------------------------------------------------
// From Endur — DEC-101, T-101, 13 § Inbox, 58 § From Endur.
//
// NO CAPABILITY AT ALL ON THESE TWO, and that is a decision rather than an omission.
//
// NOT `response.read`. That capability scopes which UNITS' responses you may see; it has
// nothing to say about a message addressed to you BY NAME, and gating on it would mean an
// administrator with no response scope could be sent a message they could never open.
//
// NOT A NEW `notification.*` MODULE IN `11` §3 either. A capability implies a shared queue
// somebody can be excluded from; this queue is one reader's, because the ROW NAMES THEM. The
// service scopes every query by `userId` from the session, which is where that is enforced —
// `authenticate` establishes who is asking and the row does the rest (INV-010's shape: the
// identity never comes from the request).
// ---------------------------------------------------------------------------

inboxRouter.get('/messages', authenticate, validate(InboxMessageListDto), (req, res, next) => {
  const { query } = req.data as { query: InboxMessageQuery };
  void readMessages(req.ctx.orgId as string, userOf(req), query)
    .then((page) => res.json(page))
    .catch(next);
});

// Two verbs, not one PATCH with a body — the same argument `13` § Inbox makes about the
// comment queue's four: they are distinct things a person does to a card, each is one click,
// and `POST /read` in a log is legible where `PATCH {read:true}` is not.
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

