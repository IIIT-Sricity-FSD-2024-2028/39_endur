export type BarRowProps = {
  label: string;
  value: number;
  total: number;
  tone?: 'accent' | 'good' | 'neutral' | 'bad';
  showPercent?: boolean;
};

export function BarRow({
  label, value, total, tone = 'accent', showPercent = false,
}: BarRowProps): JSX.Element {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`bar-row${showPercent ? ' has-percent' : ''}`}>
      <span className="bar-label">{label}</span>
      {/* Never colour alone (21 §8): the number is always rendered beside the bar. */}
      <span className="bar-track">
        <span
          className={`bar-fill fill-${tone === 'accent' ? 'accent' : tone}`}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="bar-value num">{value}</span>
      {showPercent && <span className="bar-percent num">{percent}%</span>}
    </div>
  );
}
