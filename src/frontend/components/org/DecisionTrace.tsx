import type { DecidedBy } from '@endur/shared';
import { useLabels } from '../../lib/labels.js';

export type Trace = {
  decidedBy: DecidedBy | null;
  tense?: 'past' | 'present';
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
  support: 'Endur support session',
  default: 'default',
};

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

  if (!by) {
    return <span className="trace trace-none text-meta">No grant was recorded</span>;
  }

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
