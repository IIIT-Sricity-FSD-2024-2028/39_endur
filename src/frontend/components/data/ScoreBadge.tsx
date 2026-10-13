export function ScoreBadge({ score, max = 5 }: { score: number; max?: number }): JSX.Element {
  return (
    <span className="score-badge" aria-label={`Rated ${score} out of ${max}`}>
      <strong>{score}</strong>
      <span className="score-badge-max">/{max}</span>
    </span>
  );
}
