// /r/:token/done — the applause. 39 § Thank you, design_specs/design/07 §7.5.
//
// The check animation is the one place a 320 ms animation is allowed (design_specs/design/01
// §7). Everything else on this screen is one sentence and a number.
//
// NO ACCOUNT PROMPT, EVER, and no "submit another": respondents do not have accounts
// (DEC-009) and repeats are not a thing this campaign model has. Closing the tab is the
// correct end of the flow — do not fight it.
import { useLocation } from 'react-router-dom';
import type { DoneState } from '../../lib/respond.js';
import { respondedLine, thanksLine } from './copy.js';
import { CheckGlyph } from './Unavailable.js';

export default function Done(): JSX.Element {
  // Carried from the form, not refetched. The count is not in `PublicCampaign` at all —
  // 13 §6 excludes counts from the public payload — and a thank-you that makes a request is
  // a thank-you that can fail after the answers are already saved.
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
        // The social proof, and the detail that lands: the presenter refreshes results to
        // show 612 → 613, and the two numbers agreeing is what makes it read as a real
        // system rather than a mockup. It agrees because the server counts inside the same
        // transaction that wrote the row.
        <p className="rf-count">{respondedLine(state.responseCount, state.labels)}</p>
      )}

      <p className="rf-brand" aria-hidden="true">Endur</p>
    </div>
  );
}
