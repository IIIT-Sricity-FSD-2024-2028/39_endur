import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  AudienceRule, CampaignAccess, CampaignDetail, Label, SubjectSummary, UnitNode,
} from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ProgressRail } from '../../../components/flow/ProgressRail.js';
import { Toggle } from '../../../components/form/Toggle.js';
import { Icon } from '../../../components/Icon.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { useLabels } from '../../../lib/labels.js';
import { useAppSelector } from '../../../store/index.js';
import { ApiError } from '../../../lib/api.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { useTemplates } from '../../../lib/templates.js';
import { useSubjectList } from '../../../lib/subjects.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { launchCampaign, launchKey, useCampaignList } from '../../../lib/campaigns.js';
import { summarise } from './summary.js';

const STEPS = [
  { key: 'form', label: 'Form' },
  { key: 'who', label: 'Who' },
  { key: 'when', label: 'When' },
];

export function autoName(templateName: string, now = new Date()): string {
  const month = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return `${templateName} — ${month}`;
}

export default function CampaignNew(): JSX.Element {
  const labels = useLabels();
  const navigate = useNavigate();
  const orgName = useAppSelector((state) => state.auth.org?.name ?? '');

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
  const [access, setAccess] = useState<CampaignAccess>('public');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ campaign: CampaignDetail; url: string } | null>(null);

  const templateRows = templates.data?.data ?? [];
  const subjectRows = subjects.data?.data ?? [];
  const template = templateRows.find((row) => row.id === templateId);

  const audienceLine = useAudienceLine(audience, units.data ?? [], labels.respondent);

  const chooseTemplate = (id: string, templateName: string): void => {
    setTemplateId(id);
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
        access,
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
        ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
      })
      .then(async (campaign) => {
        const result = await launchCampaign(campaign.id, launchKey(campaign.id));
        setLaunched({ campaign, url: result.url });
      })
      .catch((cause: unknown) => {
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
        access,
      }),
    [name, template, subjectIds.length, labels.subject, startsAt, endsAt, anonymous, access],
  );

  return (
    <>
      <PageHeader
        title={`New ${labels.campaign.one.toLowerCase()}`}
        vocabulary={false}
        action={<Link className="btn btn-ghost" to="/app/campaigns">Cancel</Link>}
      />

      <div className="wizard">
      <ProgressRail steps={STEPS} current={step} onStepClick={(index) => index < step && setStep(index)} />

      <div className="card panel wizard-panel">
      {step === 0 && (
        <section className="wizard-step">
          <div className="panel-section">
          <h3 className="panel-title">Which form?</h3>
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
          </div>

          <div className="panel-section">
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
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="wizard-step">
          {/* Two genuinely different questions, and this is where the generic model does
              real work: WHAT is reviewed, and WHO may answer. */}
          <div className="panel-section">
          <h3 className="panel-title">What is being reviewed?</h3>
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
          </div>

          <div className="panel-section">
          <h3 className="panel-title">Who can respond?</h3>
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
                  {flattenUnits(units.data ?? []).map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* The visible proof that the org graph is real and not decorative. */}
          <p className="audience-count">{audienceLine}</p>
          </div>

          {/* TWO DIFFERENT QUESTIONS, and 38 exists partly to stop them being folded into
              one. Above: who is EXPECTED to answer — a denominator, enforced nowhere.
              Below: who GETS IN — a gate, enforced on every request to the link. A campaign
              can perfectly well be "open to anyone with the link, and we expect the 40
              people in Housekeeping" — that is the commonest shape in the seed, and folding
              the two together would make it unsayable. The heading break is what says so. */}
          <div className="panel-section">
          <h3 className="panel-title">Who gets in?</h3>
          <div className="q-options">
            <label className="q-option">
              <input
                type="radio"
                name="access"
                checked={access === 'public'}
                onChange={() => setAccess('public')}
              />
              <span className="q-dot" aria-hidden="true" />
              {/* NOT "Anyone with the link" — that is the audience option four lines above,
                  and two radios with the same visible label on one screen is the exact
                  confusion the section break exists to prevent. Caught by a test that
                  suddenly matched two elements. This one is about getting IN, so it says
                  so. */}
              <span>Open to everyone</span>
              <span className="text-meta">No sign-in. Nobody learns who answered</span>
            </label>
            <label className="q-option">
              <input
                type="radio"
                name="access"
                checked={access === 'organization'}
                onChange={() => setAccess('organization')}
              />
              <span className="q-dot" aria-hidden="true" />
              <span>Only people in {orgName || 'your organization'}</span>
              {/* THE CONSEQUENCE, stated where the choice is made rather than in a help
                  page. This mode gives up a promise (52 §1) — participation stops being
                  private even though the answer stays anonymous — and the person choosing
                  it is the one who should be told, in the same breath. */}
              <span className="text-meta">
                They sign in first. You’ll see who responded, never what they said
              </span>
            </label>
          </div>
          {access === 'organization' && (
            <p className="field-help">
              This cannot be changed after launch, and people outside{' '}
              {orgName || 'your organization'} will not be able to answer even with the link.
            </p>
          )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wizard-step">
          <div className="panel-section">
          <h3 className="panel-title">When?</h3>
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
          </div>

          <div className="panel-section">
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
          </div>
        </section>
      )}

      {/* The same bar the setup wizard carries, in the same place, with the same back
          arrow. Two wizards in one product that end differently are two wizards to learn. */}
      <div className="flow-bar">
        {step > 0 ? (
          <button
            type="button"
            className="btn btn-secondary btn-back"
            onClick={() => setStep(step - 1)}
          >
            <Icon name="back" size={16} /> Back
          </button>
        ) : (
          <span className="flow-bar-spacer" />
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
          <button type="button" className="btn btn-primary" disabled={busy || !ready[2]} onClick={launch}>
            {busy ? 'Launching…' : `Launch ${labels.campaign.one.toLowerCase()}`}
          </button>
        )}
      </div>
      </div>
      </div>

      {launched && (
        <ShareSheet
          url={launched.url}
          campaignName={launched.campaign.name}
          status="open"
          endsAt={launched.campaign.endsAt}
          anonymous={launched.campaign.anonymous}
          access={launched.campaign.access}
          onClose={() => navigate(`/app/campaigns/${launched.campaign.id}`)}
        />
      )}
    </>
  );
}

function useAudienceLine(rule: AudienceRule, units: UnitNode[], respondent: Label): string {
  return useMemo(() => {
    if (rule.kind === 'anyone') return `Anyone holding the link can respond.`;
    if (rule.kind === 'role') return `Everyone at that role level can respond.`;
    const node = find(units, rule.unitId);
    if (!node) return 'Choose where.';
    const count = countPeople(node);
    return `About ${pluralise(count, respondent.one.toLowerCase(), respondent.many.toLowerCase())} can respond.`;
  }, [rule, units, respondent]);
}

function find(nodes: UnitNode[], id: string): UnitNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = find(node.children, id);
    if (found) return found;
  }
  return undefined;
}

const countPeople = (node: UnitNode): number => node.peopleTotal ?? 0;
