import { useLocation } from 'react-router-dom';
import type { DoneState } from '../../lib/respond.js';
import { respondedLine, thanksLine } from './copy.js';
import { CheckGlyph } from './Unavailable.js';

export default function Done(): JSX.Element {
  const state = useLocation().state as DoneState | null;

  return (
    <div className="rf-end rf-done">
      <span className="rf-check" aria-hidden="true">
        <CheckGlyph />
      </span>
      <h1 className="rf-end-title">Thank you.</h1>

      {/* Somebody who opens this URL directly never submitted anything, so there is no
          subject, no count and no anonymity to claim. They still get thanked rather than an
          error, because the alternative is a dead screen for someone who did nothing wrong. */}
      {state && (
        <p className="rf-end-body">
          {thanksLine({ subjectName: state.subjectName, anonymous: state.anonymous })}
        </p>
      )}

      {state && (
        <p className="rf-count">{respondedLine(state.responseCount, state.labels)}</p>
      )}

      <p className="rf-brand" aria-hidden="true">Endur</p>
    </div>
  );
}
