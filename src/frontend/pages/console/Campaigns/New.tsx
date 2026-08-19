// T-038 — /app/campaigns/new. 38 § Interactions, design_specs/design/06 §6.2.
//
// Three steps holding ONE draft, committed at the end — the same shape as the setup wizard
// (`31`), so the pattern is learned once and nobody has to work out a second one.
//
// It commits in two calls rather than one, and that is the contract's shape, not a shortcut:
// `POST /campaigns` creates the draft, `POST /:id/launch` mints the token. Launch is the
// irreversible act and it is idempotent by key, because a double-click on stage must not
// produce two links — the QR already on screen would then point at the wrong one.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AudienceRule, CampaignDetail, SubjectSummary, UnitNode } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ProgressRail } from '../../../components/flow/ProgressRail.js';
import { Toggle } from '../../../components/form/Toggle.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { useLabels } from '../../../lib/labels.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { useTemplates } from '../../../lib/templates.js';
import { useSubjectList } from '../../../lib/subjects.js';
import { useUnits } from '../../../lib/units.js';
import { launchCampaign, launchKey, useCampaignList } from '../../../lib/campaigns.js';
import { summarise } from './summary.js';

const STEPS = [
  { key: 'form', label: 'Form' },
  { key: 'who', label: 'Who' },
  { key: 'when', label: 'When' },
];

/** `{Template name} — {current month}`. Pre-filling removes a typing beat from the demo. */
export function autoName(templateName: string, now = new Date()): string {
  const month = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return `${templateName} — ${month}`;
}

export default function CampaignNew(): JSX.Element {
  const labels = useLabels();
  const navigate = useNavigate();

  const templates = useTemplates();
  const subjects = useSubjectList({});
  const units = useUnits();
  const list = useCampaignList();

  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [audience, setAudience] = useState<AudienceRule>({ kind: 'anyone' });
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [anonymous, setAnonymous] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The launched campaign, which opens the share sheet immediately (38). */
  const [launched, setLaunched] = useState<{ campaign: CampaignDetail; url: string } | null>(null);

  const templateRows = templates.data?.data ?? [];
  const subjectRows = subjects.data?.data ?? [];
  const template = templateRows.find((row) => row.id === templateId);

  // The audience preview needs a campaign id, which does not exist until step 3 commits.
  // Before then the count is computed from what IS known: "anyone" is uncountable by
  // definition, and the other two rules are answerable from the org graph already loaded.
  const audienceLine = useAudienceLine(audience, units.data ?? [], labels.respondent.many);

  const chooseTemplate = (id: string, templateName: string): void => {
    setTemplateId(id);
    // Only auto-fill an untouched name: overwriting something typed is the kind of small
    // theft that makes a form feel hostile.
    if (!name.trim()) setName(autoName(templateName));
  };

  const ready = [
    templateId !== '' && name.trim() !== '',
    subjectIds.length > 0,
    !endsAt || !startsAt || new Date(endsAt) > new Date(startsAt),
  ];

  const launch = (): void => {
    setBusy(true);
    setError(null);
    void list
      .create({
        name: name.trim(),
        templateId,
        subjectIds,
        audience,
        anonymous,
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
      })
      .then(async (campaign) => {
        const result = await launchCampaign(campaign.id, launchKey(campaign.id));
        setLaunched({ campaign, url: result.url });
      })
      .catch((cause: unknown) => {
        // The draft is preserved and no token is minted (38 § States) — the reader can fix
        // the dates and press again rather than starting over.
        setError(cause instanceof ApiError ? cause.message : 'That could not be launched.');
      })
      .finally(() => setBusy(false));
  };

  const summary = useMemo(
    () =>
      summarise({
        name: name.trim(),
        templateName: template?.name ?? '',
        questionCount: template?.questionCount ?? 0,
        estimatedSeconds: template?.estimatedSeconds ?? 0,
        subjectCount: subjectIds.length,
        subjectWord: { one: labels.subject.one, many: labels.subject.many },
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        anonymous,
      }),
    [name, template, subjectIds.length, labels.subject, startsAt, endsAt, anonymous],
  );

  return (
    <>
      <PageHeader
        title={`New ${labels.campaign.one.toLowerCase()}`}
        vocabulary={false}
        action={<Link className="btn btn-ghost" to="/app/campaigns">Cancel</Link>}
      />

      <ProgressRail steps={STEPS} current={step} onStepClick={(index) => index < step && setStep(index)} />

      {step === 0 && (
        <section className="wizard-step">
          <h3>Which form?</h3>
          <div className="tgrid">
            {templateRows.map((row) => {
              const time = approxDuration(row.estimatedSeconds);
              return (
                <button
                  type="button"
                  key={row.id}
                  className={`card tcard tpick${templateId === row.id ? ' is-picked' : ''}`}
                  aria-pressed={templateId === row.id}
                  onClick={() => chooseTemplate(row.id, row.name)}
                >
                  <span className="tcard-name">{row.name}</span>
                  <span className="tcard-cost">
                    {pluralise(row.questionCount, 'question', 'questions')}{time ? ` · ${time}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          {templateRows.length === 0 && !templates.loading && (
            <p className="text-muted">
              No forms yet. <Link to="/app/templates">Copy one from the library</Link> first.
            </p>
          )}

          <div className="field">
            <label htmlFor="campaign-name">Name this {labels.campaign.one.toLowerCase()}</label>
            <input
              id="campaign-name"
              className="input"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="field-help">
              Auto-filled from the form. {labels.respondent.many} see this name.
            </p>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="wizard-step">
          {/* Two genuinely different questions, and this is where the generic model does
              real work: WHAT is reviewed, and WHO may answer. */}
          <h3>What is being reviewed?</h3>
          <div className="card subject-picker">
            {subjectRows.map((subject: SubjectSummary) => (
              <label className="q-option" key={subject.id}>
                <input
                  type="checkbox"
                  checked={subjectIds.includes(subject.id)}
                  onChange={() =>
                    setSubjectIds((current) =>
                      current.includes(subject.id)
                        ? current.filter((id) => id !== subject.id)
                        : [...current, subject.id],
                    )
                  }
                />
                <span className="q-dot q-dot-square" aria-hidden="true" />
                <span>{subject.name}</span>
                <span className="text-meta">{subject.unitName ?? ''}</span>
              </label>
            ))}
            {subjectRows.length === 0 && !subjects.loading && (
              <p className="text-muted">
                No {labels.subject.many.toLowerCase()} you can see.{' '}
                <Link to="/app/subjects">Add one</Link> first.
              </p>
            )}
          </div>
          <p className="field-help">
            {pluralise(subjectIds.length, 'selected', 'selected')}. The list only shows what you
            can see — scope comes from the API, not from this page.
          </p>

          <h3>Who can respond?</h3>
          <div className="q-options">
            <label className="q-option">
              <input
                type="radio"
                name="audience"
                checked={audience.kind === 'anyone'}
                onChange={() => setAudience({ kind: 'anyone' })}
              />
              <span className="q-dot" aria-hidden="true" />
              <span>Anyone with the link</span>
              <span className="text-meta">Best for QR codes and posters</span>
            </label>
            <label className="q-option">
              <input
                type="radio"
                name="audience"
                checked={audience.kind === 'unit'}
                onChange={() =>
                  setAudience({ kind: 'unit', unitId: units.data?.[0]?.id ?? '', includeSubtree: true })
                }
              />
              <span className="q-dot" aria-hidden="true" />
              <span>Everyone in a {labels.unit.one.toLowerCase()}</span>
            </label>
            {audience.kind === 'unit' && (
              <label className="qe-field">
                <span>{labels.unit.one}</span>
                <select
                  className="input"
                  value={audience.unitId}
                  onChange={(event) =>
                    setAudience({ kind: 'unit', unitId: event.target.value, includeSubtree: true })
                  }
                >
                  {flatten(units.data ?? []).map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* The visible proof that the org graph is real and not decorative. */}
          <p className="audience-count">{audienceLine}</p>
        </section>
      )}

      {step === 2 && (
        <section className="wizard-step">
          <h3>When?</h3>
          <div className="when-row">
            <label className="qe-field">
              <span>Opens</span>
              <input
                type="datetime-local"
                className="input"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label className="qe-field">
              <span>Closes</span>
              <input
                type="datetime-local"
                className="input"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </label>
          </div>
          <p className="field-help">
            Leave Opens empty to start as soon as you launch. Leave Closes empty and it runs
            until somebody closes it.
          </p>
          {!ready[2] && <p className="form-error" role="alert">Closes has to be after Opens.</p>}

          <Toggle
            checked={anonymous}
            onChange={setAnonymous}
            label={`Collect responses anonymously`}
            hint="We never store who submitted what. This cannot be changed after launch."
          />

          {/* Everything restated in one sentence before the irreversible action. */}
          <div className="card summary-card">
            <p className="summary-name">{summary.name}</p>
            <p className="text-meta">{summary.detail}</p>
            <p className="text-meta">{summary.window}</p>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
      )}

      <div className="wizard-actions">
        {step > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 2 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready[step]}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </button>
        ) : (
          // The org's own word, never "Submit" or "Finish" (38 § Interactions).
          <button type="button" className="btn btn-primary" disabled={busy || !ready[2]} onClick={launch}>
            {busy ? 'Launching…' : `Launch ${labels.campaign.one.toLowerCase()}`}
          </button>
        )}
      </div>

      {launched && (
        // No intermediate success page. The QR is on screen the moment the call returns.
        <ShareSheet
          url={launched.url}
          campaignName={launched.campaign.name}
          status="open"
          endsAt={launched.campaign.endsAt}
          anonymous={launched.campaign.anonymous}
          onClose={() => navigate(`/app/campaigns/${launched.campaign.id}`)}
        />
      )}
    </>
  );
}

/** The tree, flattened for a `<select>`; indentation carries the shape. */
function flatten(nodes: UnitNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'  '.repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}

/**
 * The audience sentence before a campaign exists.
 *
 * `GET /:id/audience` needs an id, and there is none until step 3 commits — so the count
 * shown here is computed from the org tree already in memory. It is labelled as an
 * estimate, and the authoritative number is the one the API returns afterwards.
 */
function useAudienceLine(rule: AudienceRule, units: UnitNode[], respondentWord: string): string {
  return useMemo(() => {
    if (rule.kind === 'anyone') return `Anyone holding the link can respond.`;
    if (rule.kind === 'role') return `Everyone at that role level can respond.`;
    const node = find(units, rule.unitId);
    if (!node) return 'Choose where.';
    const count = countPeople(node);
    return `About ${pluralise(count, respondentWord.toLowerCase(), respondentWord.toLowerCase())} can respond.`;
  }, [rule, units, respondentWord]);
}

function find(nodes: UnitNode[], id: string): UnitNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = find(node.children, id);
    if (found) return found;
  }
  return undefined;
}

const countPeople = (node: UnitNode): number =>
  (node.peopleCount ?? 0) + node.children.reduce((total, child) => total + countPeople(child), 0);
