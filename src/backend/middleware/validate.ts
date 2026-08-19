// Link 9. The DTO pipe.
//
// Three properties matter, and all three are why this is a middleware rather than a call
// inside each handler:
//   - it writes req.data, NOT req.body. A handler reading req.body is reading unvalidated
//     input, and that is greppable and lint-enforced (14 §3)
//   - unknown keys are STRIPPED, not ignored — so a client cannot smuggle `orgId` or
//     `role` into a create call (INV-010)
//   - the schema is the shared DTO the React client infers its own types from. One
//     definition, both sides (DEC-003)
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

export const validate =
  (schema: z.ZodType<unknown>): RequestHandler =>
  (req, _res, next) => {
    // Express types req.body as `any`. Narrowing it to `unknown` here is not ceremony:
    // this middleware exists precisely because that value is untrusted, and `any` would
    // let it flow onward unchecked.
    const raw: unknown = { body: req.body as unknown, query: req.query, params: req.params };
    const result = schema.safeParse(raw);
    if (!result.success) return next(new ValidationError(result.error));
    // `req.data` is declared `unknown` on purpose (12 §3): handlers narrow it via the
    // same DTO type, so the parsed value never widens the request object to `any`.
    req.data = result.data;
    next();
  };
