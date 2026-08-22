// Link 13. Idempotency-Key. 13 §7.
//
// Attached per route, to the four operations where a retry would do real damage:
// campaign.launch, template.clone, person.import and respondent submit.
//
// The respondent one is why this exists. A phone on a flaky venue network retries by
// itself, and a duplicate response corrupts the demo's numbers in front of the evaluator.
// The launch one is the other visible case: a double-clicked launch that mints two tokens
// leaves the QR already on screen pointing at the wrong campaign.
//
// The first response is stored and replayed verbatim for 24 hours. Replaying is the whole
// point — a second 201 with a different id is not idempotent, it just looks like it.
import { createHash } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';

const REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;


export const idempotent = (endpoint: string): RequestHandler => {
  return (req, res, next) => {
    const key = req.get('idempotency-key');
    // Opt-in by the client (13 §7). A caller who does not send a key gets ordinary
    // at-most-once-per-request behaviour, which is what a browser form wants.
    if (!key) return next();

    void run(key, endpoint, req, res, next).catch(next);
  };
};

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

  // Capture the response instead of writing the row after the fact. A post-response
  // writer cannot know what was sent, and storing a guess is worse than storing nothing.
  const originalJson = res.json.bind(res) as (body: unknown) => Response;
  res.json = (body: unknown): Response => {
    // Only successes are replayable. Caching a 500 would make one transient failure
    // permanent for 24 hours, which is the opposite of what a retry is for.
    if (res.statusCode >= 400) return originalJson(body);

    // THE ROW IS COMMITTED BEFORE THE RESPONSE IS SENT. This used to be fire-and-forget,
    // and the gap was reachable: a retry arriving between the response and the insert missed
    // the read above, ran the handler again, and created a SECOND response — the exact
    // duplicate this middleware exists to prevent. It surfaced as an intermittent failure in
    // public.test.ts once the suite moved to a small, fast test database (D-004) and the
    // window widened relative to the work.
    //
    // Sending after the write costs one indexed insert of latency and removes the window for
    // every retry that follows a delivered response.
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
      // A duplicate here means two requests raced and both missed the read above — the
      // narrower window that remains, D-011. The unique index picked a winner; this one lost.
      .catch(() => undefined)
      .finally(() => {
        originalJson(body);
      });

    // Express only uses this for chaining, and the body is sent from the callback above.
    return res;
  };

  next();
}

function replay(
  row: { requestHash: string; status: number; body: unknown },
  requestHash: string,
  res: Response,
): void {
  // Same key, different body, is a client bug — two different operations sharing one key.
  // Answering it with the other request's response would be a silent wrong answer, so it
  // is loud instead.
  if (row.requestHash !== requestHash) {
    throw new AppError(
      'CONFLICT',
      'That idempotency key was already used for a different request.',
    );
  }
  res.setHeader('Idempotent-Replay', 'true');
  res.status(row.status).json(row.body);
}

function hashOf(req: Parameters<RequestHandler>[0]): string {
  // Hash the VALIDATED request where there is one: unknown keys are stripped by then, so
  // two requests that differ only in junk the server ignores are correctly the same
  // request. Falls back to the raw body for routes with no DTO.
  const payload = req.data ?? (req.body as unknown);
  return createHash('sha256')
    .update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(payload) ?? ''}`)
    .digest('hex');
}

/**
 * Rows older than the replay window are dead weight. Called by the seed and available to
 * a cron later; there is deliberately no timer in-process (DEC-016's reasoning applies —
 * a scheduler has to earn its place).
 */
export async function sweepIdempotencyKeys(): Promise<number> {
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - REPLAY_WINDOW_MS) } },
  });
  return count;
}
