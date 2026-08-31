// The Endur operator session, kept entirely separate from a staff session.
// Its own cookie name and its own table, so no code can mistake one kind of session for the other.
// The id is 32 random bytes kept server-side, so a forged id is simply a row that does not exist.
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { config, isProd } from '../lib/config.js';

export const OPS_COOKIE = 'endur.ops';

// 12 hours, shorter than a staff session: this one reaches every customer's plan data.
const TTL_HOURS = 12;

const cookieOptions = {
  httpOnly: true,
  secure: config.COOKIE_SECURE || isProd,
  sameSite: 'lax' as const,
  // Scoped to the platform API, so the cookie is never even sent to the tenant routes.
  path: '/api/v1/platform',
};

// Creates a session row and sets the cookie.
export async function startSession(res: Response, operatorId: string): Promise<void> {
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  await prisma.platformSession.create({ data: { id, operatorId, expiresAt } });
  res.cookie(OPS_COOKIE, id, { ...cookieOptions, maxAge: TTL_HOURS * 60 * 60 * 1000 });
}

// Logout: deletes the row, because clearing the cookie alone would leave a usable id behind.
export async function endSession(req: Request, res: Response): Promise<void> {
  const id = req.cookies?.[OPS_COOKIE] as string | undefined;
  if (id) await prisma.platformSession.deleteMany({ where: { id } });
  res.clearCookie(OPS_COOKIE, { path: cookieOptions.path });
}

export type Operator = { id: string; name: string; email: string; role: string; status: string };

// Turns the cookie into an operator, or null. Expiry is part of the query, not a branch afterwards.
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
  // A disabled operator stops working on their very next request, not at their next login.
  if (!operator || operator.status !== 'active') return null;
  return operator;
}
