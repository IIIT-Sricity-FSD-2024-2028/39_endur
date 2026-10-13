import { Link } from 'react-router-dom';
import { LabelKey } from '@endur/shared';
import { useLabels } from '../../lib/labels.js';
import { useCan } from '../../lib/capabilities.js';

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
