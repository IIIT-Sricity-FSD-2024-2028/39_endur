// Link 15. Turns an unmatched URL into a typed 404 error, so it leaves through the same funnel as everything else.
import type { RequestHandler } from 'express';
import { NotFoundError } from '../lib/errors.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};
