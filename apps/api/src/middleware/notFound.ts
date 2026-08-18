// Link 15. An unmatched route becomes a typed error so it leaves through the same funnel
// as everything else. No default Express HTML error page ever reaches a client.
import type { RequestHandler } from 'express';
import { NotFoundError } from '../lib/errors.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};
