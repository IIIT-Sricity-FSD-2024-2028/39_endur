// The signature element (22 §4). Under the page title on every console page.
//
// NO PROPS, by design. A prop would let a page pass the wrong labels, and there is only
// ever one correct source. This is also the demo's ten-second proof: on org switch it is
// the first thing to re-render, and the whole product visibly changes language (N-003).
import { Link } from 'react-router-dom';
import { LabelKey } from '@endur/shared';
import { useLabels } from '../../lib/labels.js';
import { useCan } from '../../lib/capabilities.js';

/** Four nouns, in the order the product uses them: where, what, who answers, who is rated. */
const SHOWN = LabelKey.options.filter((key) => key !== 'campaign');

export function VocabularyChips(): JSX.Element {
  const labels = useLabels();
  const can = useCan();

  return (
    <div className="chip-row">
      <ul className="chip-row-scroll">
        {SHOWN.map((key) => (
          <li key={key}>
            <span className="tag tag-neutral">{labels[key].one}</span>
          </li>
        ))}
      </ul>
      {/* Ghost, not a button: editing the vocabulary is a settings task, and the chips are
          a readout. Absent rather than disabled for someone who cannot edit (INV-003). */}
      {can('org.update') && (
        <Link className="btn btn-ghost chip-row-edit" to="/app/settings">
          Edit
        </Link>
      )}
    </div>
  );
}
