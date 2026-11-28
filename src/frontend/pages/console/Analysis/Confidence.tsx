import type { Share } from '../../../store/screens/figures.js';

type Level = 'low' | 'medium' | 'high';

const WORD: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const TONE: Record<Level, string> = { low: 'tag-warn', medium: 'tag-neutral', high: 'tag-good' };

export function ConfidenceTag({ level }: { level: Level }): JSX.Element {
  return (
    <span className={`tag ${TONE[level]} confidence-tag`}>
      {WORD[level]} confidence
    </span>
  );
}

/** Every number here is `selectAnalysisFigures`' (store/screens/analysis.ts, R-717): the
 *  rate and the confidence arrive worked out, with the counts they were worked out from. */
export function ReliabilityStrip({
  responseCount,
  rate,
  confidence,
}: {
  responseCount: number;
  rate: Share | null;
  confidence: Level;
}): JSX.Element {
  const percent = rate === null ? null : rate.percent;

  return (
    <div className="reliability-strip">
      <ConfidenceTag level={confidence} />
      <p className="reliability-text">
        <strong className="num">{responseCount}</strong> response
        {responseCount === 1 ? '' : 's'}
        {/* NULL IS NOT ZERO AND IS NOT A DASH IN A PERCENTAGE COLUMN. An open audience has
            no denominator, and neither does a filtered slice — summing across campaigns
            where one of them is open would understate the denominator and so overstate the
            rate. `40` learned this at T-040 (N-044): a response rate whose halves are
            measured differently is not a low rate, it is a wrong one. */}
        {rate !== null ? (
          <> of <span className="num">{rate.of}</span> asked · <span className="num">{rate.percent}%</span> replied</>
        ) : (
          <> · no fixed list to compare against, so there is no response rate</>
        )}
        {percent !== null && percent < 20 && (
          <> · a rate this low usually means the people who felt strongly answered</>
        )}
      </p>
    </div>
  );
}
