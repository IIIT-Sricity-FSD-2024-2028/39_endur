// The operator session. 19 §7, DEC-072.
//
// A SEPARATE COOKIE NAME IS NOT TIDINESS. One session, two meanings is how privilege
// confusion bugs happen: any code path that asks "is there a session?" without asking
// "which kind?" becomes a vulnerability the moment the second kind exists. Two names means
// a mis-scoped middleware fails closed and loudly rather than open and silently.
//
// WHY THIS IS NOT A SECOND express-session (DEC-072). `req.session` is single-valued —
// two instances on one app both write it and whichever ran last wins, which is precisely
// the "one session, two meanings" failure the second cookie name exists to prevent. So the
// store is its own table and the reader is this file, and nothing else in the codebase
// reads `endur.ops` at all.
//
// The id is 32 random bytes held server-side, so it is the credential and there is nothing
// a signature would add: a forged id is a row that does not exist.
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { config, isProd } from '../lib/config.js';

export const OPS_COOKIE = 'endur.ops';

/**
 * Deliberately shorter than the staff session (`SESSION_TTL_DAYS`, 7 by default). An
 * operator session reaches every customer's plan data, so the window it is worth stealing
 * for should be the smaller one.
 */
const TTL_HOURS = 12;

const cookieOptions = {
  httpOnly: true,
  secure: config.COOKIE_SECURE || isProd,
  sameSite: 'lax' as const,
  // Scoped to the platform API. A cookie that is not sent to /api/v1/campaigns cannot be
  // read by a middleware that had no business seeing it.
  path: '/api/v1/platform',
};

export async function startSession(res: Response, operatorId: string): Promise<void> {
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  await prisma.platformSession.create({ data: { id, operatorId, expiresAt } });
  res.cookie(OPS_COOKIE, id, { ...cookieOptions, maxAge: TTL_HOURS * 60 * 60 * 1000 });
}

/** Server-side destruction. Clearing the cookie alone would leave a usable id behind. */
export async function endSession(req: Request, res: Response): Promise<void> {
  const id = req.cookies?.[OPS_COOKIE] as string | undefined;
  if (id) await prisma.platformSession.deleteMany({ where: { id } });
  res.clearCookie(OPS_COOKIE, { path: cookieOptions.path });
}

export type Operator = { id: string; name: string; email: string; role: string; status: string };

/**
 * Resolve the cookie to an operator, or null. Expiry is checked in the QUERY rather than
 * in JavaScript afterwards: a row that has expired is a row that does not match, so there
 * is no branch anybody can forget to write.
 */
export async function loadOperator(req: Request): Promise<Operator | null> {
  const id = req.cookies?.[OPS_COOKIE] as string | undefined;
  if (!id) return null;
  const session = await prisma.platformSession.findFirst({
    where: { id, expiresAt: { gt: new Date() } },
    select: {
      operator: { select: { id: true, name: true, email: true, role: true, status: true } },
    },
  });
  const operator = session?.operator;
  // A disabled operator's live session stops working on the next request, not at its next
  // login — the same property the org side gets from resolving permissions per request.
  if (!operator || operator.status !== 'active') return null;
  return operator;
}
