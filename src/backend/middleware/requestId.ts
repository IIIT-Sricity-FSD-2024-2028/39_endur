// Link 1. Reads X-Request-Id or mints one, and echoes it back.
//
// Everything downstream carries it — logs, audit rows, error envelopes — so a user
// reporting "it failed" hands over one string that finds the whole story.
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const HEADER = 'x-request-id';
// An inbound id is a correlation hint from a proxy, not trusted input: cap it and strip
// anything that could break a log line or forge a second field.
const SAFE = /^[A-Za-z0-9_.:-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.get(HEADER);
  const id = inbound && SAFE.test(inbound) ? inbound : randomUUID();
  req.ctx.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
