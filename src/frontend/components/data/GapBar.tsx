export function GapBar({
  label,
  self,
  received,
  max,
}: {
  label: string;
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
