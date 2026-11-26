// The three-step campaign wizard. Everything typed and chosen is `state.campaigns.wizard`
// (store/screens/campaigns.ts), every change an action; Launch is the `campaignLaunchSubmitted`
// thunk. docs/REDUX-PLAN.md §6.10.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AudienceRule, Label, SubjectSummary, TemplateSummary, UnitNode } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { ProgressRail } from '../../../components/flow/ProgressRail.js';
import { Toggle } from '../../../components/form/Toggle.js';
import { Icon } from '../../../components/Icon.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { useLabels } from '../../../lib/labels.js';
import { useAppDispatch, useAppSelector } from '../../../store/index.js';
import { approxDuration, pluralise } from '../../../lib/format.js';
import { PAST_CLOSE, toLocalInput } from '../../../lib/when.js';
import { useTemplateLibrary, useTemplates } from '../../../lib/templates.js';
import { canAny, FORM_BUILDING, useCan } from '../../../lib/capabilities.js';
import { useSubjectList } from '../../../lib/subjects.js';
import { useUnits } from '../../../lib/units.js';
import { flattenUnits } from '../../../lib/tree.js';
import { messageOf, useClearOnLeave } from '../../../store/screens/common.js';
import {
  accessChosen,
  anonymityChosen,
  audienceChosen,
  campaignLaunchSubmitted,
  campaignNameEdited,
  campaignWizardLeft,
  closesAtEdited,
  formPicked,
  launchAttempted,
  opensAtEdited,
  selectClosesInPast,
  selectStepsReady,
  selectWizard,
  subjectToggled,
  windowInOrder as inOrder,
  wizardStepChanged,
} from '../../../store/screens/campaigns.js';
import { summarise } from './summary.js';

const STEPS = [
  { key: 'form', label: 'Form' },
  { key: 'who', label: 'Who' },
  { key: 'when', label: 'When' },
];

export { autoName } from '../../../store/screens/campaigns.js';

export default function CampaignNew(): JSX.Element {
  const labels = useLabels();
  const navigate = useNavigate();
  const orgName = useAppSelector((state) => state.auth.org?.name ?? '');
  const orgIndustry = useAppSelector((state) => state.auth.org?.industry ?? '');
  const can = useCan();
  const mayCopy = can('template.clone');

  const templates = useTemplates();
  // THE LIBRARY, HERE. Whoever runs campaigns but does not build forms has no Templates page
  // (FORM_BUILDING), so the forms they may copy are offered where they choose one, and the
  // copy is made when they launch.
  const library = useTemplateLibrary({}, mayCopy);
  const subjects = useSubjectList({});
  const units = useUnits();

  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectWizard);
  const ready = useAppSelector(selectStepsReady);
  const closesInPast = useAppSelector(selectClosesInPast);
  const windowInOrder = inOrder(draft);
  useClearOnLeave(campaignWizardLeft());
  const { step, templateId, name, subjectIds, audience, startsAt, endsAt, anonymous, access } = draft;
  const busy = draft.sending;
  const error = messageOf(draft.error, 'That could not be launched.');
  const launched = draft.launched;

  const templateRows = templates.data?.data ?? [];
  // This industry's library forms the organisation does not already have. "Has" is a copy of
  // it (listed with its own forms, under whatever name it was given) or a form of the same
  // name: a seeded organisation's forms were written directly, not copied, and two cards
  // called "Course feedback" would be one choice offered twice.
  const alreadyCopied = new Set(templateRows.map((row) => row.clonedFromId));
  const ownNames = new Set(templateRows.map((row) => row.name.trim().toLowerCase()));
  const libraryRows = mayCopy
    ? (library.data ?? []).filter(
      (row) =>
        !alreadyCopied.has(row.id) &&
        !ownNames.has(row.name.trim().toLowerCase()) &&
        (!row.industry || !orgIndustry || row.industry === orgIndustry),
    )
    : [];
  const subjectRows = subjects.data?.data ?? [];
  const template = [...templateRows, ...libraryRows].find((row) => row.id === templateId);

  const audienceLine = useAudienceLine(audience, units.data ?? [], labels.respondent);

  const chooseTemplate = (id: string, templateName: string): void => {
    dispatch(formPicked(id, templateName));
  };
  const setStep = (next: number): void => {
    dispatch(wizardStepChanged(next));
  };

  const launch = (): void => {
    // Judge Closes again first: the thunk's `condition` then refuses a wizard left open past
    // its own closing time, and a second press while the first is in flight.
    dispatch(launchAttempted());
    void dispatch(campaignLaunchSubmitted({ isLibrary: template?.isLibrary ?? false }));
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
          {templateRows.length > 0 && (
            <div className="tgrid">
              {templateRows.map((row) => (
                <FormPick key={row.id} row={row} picked={templateId === row.id} onPick={chooseTemplate} />
              ))}
            </div>
          )}
          {libraryRows.length > 0 && (
            <>
              <h4 className="tsection-head wizard-library-head">From the library</h4>
              <p className="text-meta wizard-library-hint">
                Copied into {orgName || 'your organization'} when you launch.
              </p>
              <div className="tgrid">
                {libraryRows.map((row) => (
                  <FormPick key={row.id} row={row} picked={templateId === row.id} onPick={chooseTemplate} />
                ))}
              </div>
            </>
          )}
          {templateRows.length === 0 && libraryRows.length === 0 && !templates.loading && !library.loading && (
            <p className="text-muted">
              No forms yet.{' '}
              {canAny(can, FORM_BUILDING)
                ? <Link to="/app/templates">Build one, or copy one from the library</Link>
                : 'Whoever manages forms for your organization can add one.'}
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
              onChange={(event) => dispatch(campaignNameEdited({ name: event.target.value }))}
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
                  onChange={() => dispatch(subjectToggled({ subjectId: subject.id }))}
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
                onChange={() => dispatch(audienceChosen({ audience: { kind: 'anyone' } }))}
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
                  dispatch(audienceChosen({
                    audience: { kind: 'unit', unitId: units.data?.[0]?.id ?? '', includeSubtree: true },
                  }))
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
                    dispatch(audienceChosen({
                      audience: { kind: 'unit', unitId: event.target.value, includeSubtree: true },
                    }))
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
                onChange={() => dispatch(accessChosen({ access: 'public' }))}
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
                onChange={() => dispatch(accessChosen({ access: 'organization' }))}
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
                onChange={(event) => dispatch(opensAtEdited({ value: event.target.value }))}
              />
            </label>
            <label className="qe-field">
              <span>Closes</span>
              <input
                type="datetime-local"
                className="input"
                min={toLocalInput(draft.judgedAt || Date.now())}
                value={endsAt}
                aria-invalid={closesInPast || !windowInOrder || undefined}
                onChange={(event) => dispatch(closesAtEdited(event.target.value))}
              />
            </label>
          </div>
          <p className="field-help">
            Leave Opens empty to start as soon as you launch. Leave Closes empty and it runs
            until somebody closes it.
          </p>
          {closesInPast ? (
            <p className="form-error" role="alert">{PAST_CLOSE}</p>
          ) : (
            !windowInOrder && <p className="form-error" role="alert">Closes has to be after Opens.</p>
          )}
          </div>

          <div className="panel-section">
          <Toggle
            checked={anonymous}
            onChange={(next) => dispatch(anonymityChosen({ anonymous: next }))}
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
          campaignName={launched.name}
          status="open"
          endsAt={launched.endsAt}
          anonymous={launched.anonymous}
          access={launched.access}
          onClose={() => navigate(`/app/campaigns/${launched.campaignId}`)}
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

/** One form to choose. The organisation's and the library's look the same: a form is a form. */
function FormPick({
  row,
  picked,
  onPick,
}: {
  row: TemplateSummary;
  picked: boolean;
  onPick: (id: string, name: string) => void;
}): JSX.Element {
  const time = approxDuration(row.estimatedSeconds);
  return (
    <button
      type="button"
      className={`card tcard tpick${picked ? ' is-picked' : ''}`}
      aria-pressed={picked}
      onClick={() => onPick(row.id, row.name)}
    >
      <span className="tcard-name">{row.name}</span>
      <span className="tcard-cost">
        {pluralise(row.questionCount, 'question', 'questions')}{time ? ` · ${time}` : ''}
      </span>
    </button>
  );
}
