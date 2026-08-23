// ctx.tx — the transaction helper that makes INV-007 true.
//
// The subtle requirement: an audit row must be written IN THE SAME TRANSACTION as the
// mutation it describes. A post-response middleware writing its own transaction can
// succeed when the mutation rolled back, or the reverse — and an audit log that disagrees
// with reality is worse than no audit log at all (12 §4.14).
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './client.js';

export type Tx = Prisma.TransactionClient;

export async function runInTransaction<T>(req: Request, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await fn(tx);
    await flushAudit(req, tx);
    return result;
  });
}

/**
 * DEC-045. Actions whose audit row carries NO ACTOR AND NO IP, whoever is signed in.
 *
 * DEC-040 keyed that rule on the PRINCIPAL — `ip` for a `user` and nobody else — which was
 * right while a respondent could never be one. DEC-037 made them one: an `organization`
 * campaign is answered by a signed-in member, so the ordinary rule would have written
 * Priya's user id and her address onto the audit row for `response.submit`, and
 * `responses.submitted_at` is committed in the SAME TRANSACTION:
 *
 *   audit_log   response.submit · campaign X · 14:05:11 · priya · 203.0.113.44
 *   responses            (anon) · campaign X · 14:05:11
 *
 * Sort both by time, zip them, and the answers have names against them. That is worse than
 * the IP leak D-019 closed, and it arrives by a different door — which is why the rule is
 * re-keyed on THE ACTION rather than patched again on the principal.
 *
 * It is a list, at the writer, and not a flag at the call site. A flag is a thing the next
 * respondent-facing handler forgets; this is a list they have to add to. And it protects
 * every reader anybody builds later rather than the one screen (56) that reads audit rows
 * today — a fix at the reader would have to be repeated, and one day would not be.
 */
const ANONYMOUS_ACTIONS: ReadonlySet<string> = new Set(['response.submit']);

async function flushAudit(req: Request, tx: Tx): Promise<void> {
  const { audit, decision, requestId, orgId, principal } = req.ctx;
  if (audit.length === 0) return;

  await tx.auditLog.createMany({
    data: audit.map((intent) => ({
      orgId: orgId ?? null,
      actorUserId:
        principal?.kind === 'user' && !ANONYMOUS_ACTIONS.has(intent.action) ? principal.id : null,
      action: intent.action,
      targetType: intent.targetType ?? null,
      targetId: intent.targetId ?? null,
      // WHICH GRANT decided it. The resolver is the only thing that knows, which is why
      // the decision is carried on the context rather than recomputed here (INV-007).
      ...(decision?.decidedBy ? { decidedBy: decision.decidedBy } : {}),
      requestId,
      // DEC-040. IP IS WRITTEN FOR A `user` PRINCIPAL AND NOBODY ELSE.
      //
      // A respondent submission writes an audit row -- correctly, INV-007 covers every
      // state change and a submission is the most consequential one in the product. Until
      // this line was narrowed, that row carried the submitting IP, and
      // `responses.submitted_at` is written in the SAME TRANSACTION. So:
      //
      //   audit_log   response.submit · campaign X · 14:05:11 · 203.0.113.44
      //   responses            (anon) · campaign X · 14:05:11
      //
      // Sort both by time, zip them, and you have IP addresses against answers. INV-006
      // says an anonymous response has no retrievable link to a respondent; that link
      // would have been built out of two tables which each keep the promise alone.
      //
      // The fix is HERE, at the writer, and not at the reader (56 renders audit rows and
      // its DTO has no `ip` field either). A reader-side filter protects one screen; this
      // protects every screen anybody builds later.
      //
      // `ip` stays for user principals: "who changed this permission, and from where" is
      // real forensics on the one table that answers it.
      //
      // DEC-045 narrowed it once more. `principal.kind` was the right key only while a
      // respondent could never be a user; DEC-037 made them one. See ANONYMOUS_ACTIONS.
      ip:
        principal?.kind === 'user' && !ANONYMOUS_ACTIONS.has(intent.action)
          ? (req.ip ?? null)
          : null,
    })),
  });

  // Written; do not write again if the handler calls tx twice.
  req.ctx.audit = [];
  req.ctx.auditWritten = true;
}
