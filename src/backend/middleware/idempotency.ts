// Link 13. Idempotency-Key: when a client retries with the same key, the first response is replayed
// instead of the work happening twice. Used where a retry really hurts - launching a campaign, cloning a
// template, importing people, and a respondent submitting answers.
import { createHash } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';

const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;


export const idempotent = (endpoint: string): RequestHandler => {
  return (req, res, next) => {
    const key = req.get('idempotency-key');
    // Opt-in: no key means ordinary behaviour, which is what a normal browser form wants.
    if (!key) return next();

    void run(key, endpoint, req, res, next).catch(next);
  };
};

// The real work: replay when the key is known, otherwise let the handler run and capture its response.
async function run(
  key: string,
  endpoint: string,
  req: Parameters<RequestHandler>[0],
  res: Response,
  next: Parameters<RequestHandler>[2],
): Promise<void> {
  const orgId = req.ctx.orgId ?? null;
  const requestHash = hashOf(req);

  const existing = await prisma.idempotencyKey.findFirst({
    where: { orgId, key, endpoint, createdAt: { gt: new Date(Date.now() - REPLAY_WINDOW_MS) } },
  });

  if (existing) return replay(existing, requestHash, res);

  // Wrap res.json, so the response can be stored exactly as it was sent.
  const originalJson = res.json.bind(res) as (body: unknown) => Response;
  res.json = (body: unknown): Response => {
    // Only successes are stored. Caching a 500 would make one blip permanent for 24 hours.
    if (res.statusCode >= 400) return originalJson(body);

    // Store the row BEFORE sending, so a fast retry cannot slip in between the response and the insert.
    void prisma.idempotencyKey
      .create({
        data: {
          orgId,
          key,
          endpoint,
          requestHash,
          status: res.statusCode,
          body: body as never,
        },
      })
      // A duplicate here means two requests raced; the unique index picked a winner and this one lost.
      .catch(() => undefined)
      .finally(() => {
        originalJson(body);
      });

    // Express only uses this return value for chaining; the body is sent in the callback above.
    return res;
  };

  next();
}

// Sends the stored response again, marked with an Idempotent-Replay header.
function replay(
  row: { requestHash: string; status: number; body: unknown },
  requestHash: string,
  res: Response,
): void {
  // The same key with a different body is a client bug, so it fails loudly instead of answering with the wrong response.
  if (row.requestHash !== requestHash) {
    throw new AppError(
      'CONFLICT',
      'That idempotency key was already used for a different request.',
    );
  }
  res.setHeader('Idempotent-Replay', 'true');
  res.status(row.status).json(row.body);
}

// A fingerprint of this request, used to check that a repeated key really is the same request.
function hashOf(req: Parameters<RequestHandler>[0]): string {
  // Hash the validated request where there is one, so junk the server ignores does not make it a different request.
  const payload = req.data ?? (req.body as unknown);
  return createHash('sha256')
    .update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(payload) ?? ''}`)
    .digest('hex');
}

// Deletes rows older than the replay window. Called by the seed, and can be run from a cron later.
export async function sweepIdempotencyKeys(): Promise<number> {
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - REPLAY_WINDOW_MS) } },
  });
  return count;
}
