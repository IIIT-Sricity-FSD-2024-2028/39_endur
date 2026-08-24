// <ScoreBadge> — 24 §3, and it took CONF-022 to get built.
//
// CONF-016 refused this component, and it was right to. `24` §3 defined it as a score "with
// threshold colours", `40` § Interactions forbids exactly that — *"Do not colour rating 1
// red and rating 5 green — that is interpretation"* — and `40`'s was the only would-be
// caller. A component whose single use is the one place the docs rule out is a component
// that eventually acquires an illegitimate one.
//
// `58` changes the premise, not the prohibition:
//
//   · The number on an inbox card is ONE PERSON'S OWN RATING on the response their comment
//     came from, not an average over anybody. *"2/5 · the projector in Room 4 has never
//     worked"* is a fact somebody stated, and reporting it is not judging it.
//   · The COLOURS are still interpretation, and they are not here. This badge is one
//     neutral surface at every value. Painting a 2 red would be the client deciding a 2 is
//     bad, which is CONF-004 exactly.
//
// So: built, because there is now a legitimate caller; colourless, because the reason it
// was refused has not changed.
export function ScoreBadge({ score, max = 5 }: { score: number; max?: number }): JSX.Element {
  return (
    <span className="score-badge" aria-label={`Rated ${score} out of ${max}`}>
      <strong>{score}</strong>
      <span className="score-badge-max">/{max}</span>
    </span>
  );
}
