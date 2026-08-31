// Link 1. Takes the X-Request-Id header or makes one, puts it on the request and echoes it back.
// Logs, audit rows and error replies all carry it, so one id finds the whole story of a request.
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const HEADER = 'x-request-id';
// An incoming id is a hint, not trusted input: only this safe shape is accepted, anything else is replaced.
const SAFE = /^[A-Za-z0-9_.:-]{1,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.get(HEADER);
  const id = inbound && SAFE.test(inbound) ? inbound : randomUUID();
  req.ctx.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
