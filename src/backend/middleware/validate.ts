// Link 9. Validates the request against a shared Zod schema before any handler runs.
// The clean value goes on req.data, unknown keys are stripped, and handlers never read req.body.
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

// The schema is hung on the middleware itself, so the OpenAPI document can describe the real one.
export const DTO_TAG = Symbol.for('endur.dto');

export const validate = (schema: z.ZodType<unknown>): RequestHandler => {
  const handler: RequestHandler = (req, _res, next) => {
    // req.body is typed any by Express; narrowing to unknown keeps untrusted input from flowing on unchecked.
    const raw: unknown = { body: req.body as unknown, query: req.query, params: req.params };
    const result = schema.safeParse(raw);
    if (!result.success) return next(new ValidationError(result.error));
    // req.data stays typed unknown on purpose: each handler narrows it with the same shared DTO type.
    req.data = result.data;
    next();
  };
  return Object.assign(handler, { [DTO_TAG]: schema });
};
