// The organisation's activity log. 56, 13 § Trust, DEC-040, DEC-041.
//
// `audit_log` has been written on every state change since T-013 and, until this file
// existed, had never once been read. That is what made DEC-040's leak dormant rather than
// live, and it is why the shape below is defined by what it REFUSES to carry.
import { z } from 'zod';
import { dto } from './common.js';
import { Id, PageQuery } from './common.js';
import type { Capability } from '../capabilities.js';
import type { DecidedBy } from '../errors.js';

/**
 * DEC-041. A row used to mean SOMETHING HAPPENED; it now also means somebody was refused.
 *
 * The refusals are the half an administrator actually wants from a thing called a log:
 * *"somebody tried to launch a campaign in Engineering and was refused"* is a security
 * event, where *"somebody launched one"* is a business record.
 */
export const AuditOutcome = z.enum(['allowed', 'denied']);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

/**
 * Every filter lives in the URL (56 § State) — a filtered log is linkable, and *"here is
 * the row I mean"* pasted into a chat is the whole reason two people open this page
 * together.
 *
 * `action` is a free string rather than the capability enum on purpose: a row written by a
 * version that knew a capability this one does not must still be filterable. Bounded, like
 * every string we accept.
 */
export const AuditQuery = PageQuery.extend({
  actorId: Id.optional(),
  action: z.string().max(64).optional(),
  targetType: z.string().max(32).optional(),
  outcome: AuditOutcome.optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export const AuditListDto = dto({ query: AuditQuery });

/**
 * WHICH GRANT decided it (INV-007) — the thing that turns "access denied" from an
 * assertion into evidence, and the thing `42` replays.
 *
 * The type itself lives in `errors.ts`, because a 403 body carries the same trace — see
 * `DecidedBy` there. It is named here because BOTH apps render it:
 * the resolver's own `Decision` is structurally assignable to the type below, and
 * `<DecisionTrace>` (24 §6c) is one component with two tenses — *would this be allowed*
 * for the simulator, *why was this allowed* for the log. A forked renderer would
 * eventually describe the same trace two different ways, which is precisely the
 * credibility the trace exists to buy (53).
 */
export type DecisionView = {
  allowed: boolean;
  capability: Capability;
  reason: 'granted' | 'explicit_deny' | 'out_of_scope' | 'expired' | 'no_grant';
  decidedBy?: DecidedBy | undefined;
  /**
   * ABSENT from a production 403 body (11 §10), so `<DecisionTrace compact>` must render
   * correctly WITHOUT it rather than merely tolerate it — an audit row carries the
   * deciding grant and never the rejected candidates.
   */
  considered?: Array<{
    grantId: string;
    via: string;
    scope: string;
    effect: string;
    rejectedBecause?: string;
  }>;
};

/**
 * One row of the log.
 *
 * **`ip` is not in this type and must never be added.** It exists on the row for staff
 * forensics (10 §5) and is deliberately not part of the read surface: an administrator
 * does not need a colleague's home address to understand who renamed a unit, and a field
 * that is on screen is a field that ends up in a screenshot. If a genuine forensic need
 * appears it is a separate capability and a separate view, not a column here.
 *
 * **`actor` is null for a respondent submission**, and that is the whole of what such a row
 * says — the action, the campaign, the time (56 § Anonymity, DEC-045).
 */
export type AuditEntry = {
  id: string;
  at: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  /** A capability string, rendered through the shared `describe()` and never a second
   *  English mapping (33, D-008). */
  action: string;
  /** `name` is null when the thing acted upon has since been deleted. The row is still
   *  rendered — a record that quietly drops the rows whose subjects are gone is a record
   *  that can be edited by deleting things (56 § States). */
  target: { type: string; id: string | null; name: string | null } | null;
  outcome: AuditOutcome;
  decidedBy: DecidedBy | null;
  requestId: string | null;
};
