// <GapBar> — 24 §3, new at T-084 for `44` § The gap view.
//
// Two bars on ONE axis, which is the whole requirement: self and received have to be
// directly comparable or the gap is two numbers in a row rather than a finding.
//
// IT NAMES NO WINNER. `44` is explicit — self higher than received is a blind spot, self
// lower is under-confidence, both are worth knowing and NEITHER IS A GRADE. *"A gap view
// that reads as an accusation guarantees the next reflection is gamed."* So there is no
// valence, no red, no green: one accent tone for the person's own reading and one neutral
// tone for everybody else's, and the delta is stated as a signed number with a plain word.
export function GapBar({
  label,
  self,
  received,
  max,
}: {
  label: string;
  /** `null` where the question has no number — a paragraph has no average (44). */
  self: number | null;
  received: number | null;
  max: number | null;
}): JSX.Element {
  const scale = max && max > 0 ? max : 5;
  const width = (value: number | null) =>
    value === null ? 0 : `${Math.min(100, Math.max(0, (value / scale) * 100))}%`;
  const delta = self === null || received === null ? null : Math.round((self - received) * 100) / 100;

  return (
    <div className="gap-row">
      <p className="gap-label">{label}</p>

      {self === null && received === null ? (
        // NOT a zero-length bar. A written answer has no average, and drawing an empty bar
        // for it would say "scored nothing" about a question nobody scored.
        <p className="text-meta">Written answer — nothing to compare.</p>
      ) : (
        <>
          <div className="gap-pair">
            <span className="gap-key">You</span>
            <span className="gap-track">
              <span className="gap-fill is-self" style={{ width: width(self) }} />
            </span>
            <span className="num gap-value">{self ?? '—'}</span>
          </div>
          <div className="gap-pair">
            <span className="gap-key">Others</span>
            <span className="gap-track">
              <span className="gap-fill is-received" style={{ width: width(received) }} />
            </span>
            <span className="num gap-value">{received ?? '—'}</span>
          </div>
          {delta !== null && delta !== 0 && (
            <p className="text-meta gap-delta">
              {/* The two directions, in 44's own words and in neither's favour. */}
              {delta > 0
                ? `You rated yourself ${delta} higher than others did.`
                : `You rated yourself ${Math.abs(delta)} lower than others did.`}
            </p>
          )}
          {delta === 0 && <p className="text-meta gap-delta">You and others read this the same way.</p>}
        </>
      )}
    </div>
  );
}
