import type { ResolvedLabels } from '@endur/shared';
import { Icon } from '../Icon.js';

export function DashboardPreview({
  labels,
  kicker = 'Live preview',
}: {
  labels: ResolvedLabels;
  kicker?: string;
}): JSX.Element {
  return (
    <div className="preview" aria-hidden="true">
      <p className="utility preview-kicker">{kicker}</p>
      <div className="preview-inner">
        <div className="preview-nav">
          <span><Icon name="home" size={16} /> Home</span>
          <span><Icon name="structure" size={16} /> {labels.unit.many}</span>
          <span><Icon name="subject" size={16} /> {labels.subject.many}</span>
          <span><Icon name="campaign" size={16} /> {labels.campaign.many}</span>
        </div>
        <p className="preview-sentence">
          Spring 2026 · 4 {labels.subject.many} · 1,057 {labels.respondent.many} responded
        </p>
      </div>
    </div>
  );
}
