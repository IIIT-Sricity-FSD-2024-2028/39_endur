// <DecisionTrace> — 24 §6c, built at T-076.
//
// TWO PLACEMENTS, ONE IMPLEMENTATION, and that is the whole reason it is an inventory
// entry rather than a lump of JSX inside a page. `42`'s simulator and `56`'s activity log
// ask the same question in two tenses — *would this be allowed* and *why was this allowed*
// — and a forked renderer would eventually describe the same trace two different ways,
// which is precisely the credibility the trace exists to buy (`53`).
//
// `T-054` builds the simulator and EXTENDS this (INV-009). It does not fork it.
import type { DecidedBy } from '@endur/shared';
import { useLabels } from '../../lib/labels.js';

/**
 * What the caller passes. Deliberately looser than the resolver's `Decision`: an audit row
 * carries only the deciding grant, and a production 403 body carries no `considered` list
 * at all (`11` §10). The compact form therefore has to render CORRECTLY without either,
 * not merely tolerate their absence.
 */
export type Trace = {
  decidedBy: DecidedBy | null;
  /** Present tense for the simulator, past tense for the log. Defaults to past. */
  tense?: 'past' | 'present';
  /** Absent from a production 403 (11 §10). The full form omits the section when it is. */
  considered?: Array<{
    grantId: string;
    via: string;
    scope: string;
    effect: string;
    rejectedBecause?: string;
  }>;
};

const VIA: Record<string, string> = {
  role: 'role',
  position: 'position',
  group: 'group',
  person: 'grant made to them directly',
  delegation: 'delegation',
  default: 'default',
};

/** `11` §4's four scopes, said in words. A raw `own_unit` on screen is a leaked column name. */
function scopeWords(scope: string | undefined, unitWord: string): string {
  switch (scope) {
    case 'self': return 'themselves only';
    case 'own_unit': return `that ${unitWord} only`;
    case 'subtree': return `that ${unitWord} and everything under it`;
    case 'all': return 'the whole organisation';
    default: return 'an unrecorded reach';
  }
}

export function DecisionTrace({
  decision,
  compact = false,
}: {
  decision: Trace;
  compact?: boolean;
}): JSX.Element {
  const labels = useLabels();
  const unitWord = labels.unit.one.toLowerCase();
  const by = decision.decidedBy;

  // NOT an error, and not blank. A row with no trace is an old row, or one written before
  // the resolver ran at all — 56 § States requires it renders anyway, because a log that
  // drops the rows it cannot fully explain is a log that can be edited by confusing it.
  if (!by) {
    return <span className="trace trace-none text-meta">No grant was recorded</span>;
  }

  // The two tenses. `56` asks *why was this allowed* about a real event; `42` asks *would
  // this be allowed* about a hypothetical one, and saying "Allowed by" of something that
  // has not happened is the exact confusion a shared component has to avoid.
  const denied = by.effect === 'deny';
  const verb =
    decision.tense === 'present'
      ? denied ? 'Would be blocked by' : 'Would be allowed by'
      : denied ? 'Blocked by' : 'Allowed by';
  const anchor = by.anchorUnitName;

  if (compact) {
    return (
      <span className={`trace trace-compact${denied ? ' is-deny' : ''}`}>
        <span className="trace-verb">{verb}</span>{' '}
        <strong>{by.subjectName || VIA[by.via] || by.via}</strong>
        {anchor && <span className="text-meta"> · {anchor}</span>}
      </span>
    );
  }

  return (
    <div className={`trace trace-full${denied ? ' is-deny' : ''}`}>
      <p className="trace-sentence">
        {verb} the <strong>{by.subjectName || by.via}</strong>{' '}
        {VIA[by.via] ?? by.via}, reaching {scopeWords(by.scope, unitWord)}
        {anchor && (
          <>
            , anchored at <strong>{anchor}</strong>
          </>
        )}
        .
      </p>

      {/* INV-005 stated in the past tense about a real event, which is the cheapest
          demonstration of the permission model in the product — cheaper than the
          simulator, because the data is real. */}
      {decision.considered && decision.considered.length > 0 && (
        <>
          <p className="text-meta trace-heading">Also considered</p>
          <ul className="trace-considered">
            {decision.considered.map((entry) => (
              <li key={entry.grantId}>
                <span className="trace-considered-what">
                  {entry.effect === 'deny' ? 'A block' : 'An allow'} via {entry.via}, reaching{' '}
                  {scopeWords(entry.scope, unitWord)}
                </span>
                {entry.rejectedBecause && (
                  <span className="text-meta"> — {entry.rejectedBecause}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
