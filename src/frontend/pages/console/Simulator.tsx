// T-054 — /app/simulator. 42.
//
// THE SENTENCE MUST NEVER BE ABLE TO ASK AN INVALID QUESTION. Every blank is a dropdown
// populated from real objects in this organisation, so "Test" always sends a query the
// server can actually answer — there is no free-text principal, capability, or target id
// anywhere on this screen.
//
// `<DecisionTrace>` is EXTENDED here, not forked (`T-076`, INV-009, `24` §6c) — it is the
// same component `56`'s activity log renders, in the present tense instead of the past.
import { useMemo, useState } from 'react';
import type { Capability, PersonSummary, SimulateBody, SimulateTarget } from '@endur/shared';
import { isCapability } from '@endur/shared';
import { PageHeader } from '../../components/layout/PageHeader.js';
import { EmptyState } from '../../components/feedback/EmptyState.js';
import { DecisionTrace } from '../../components/org/DecisionTrace.js';
import { UnitTree } from '../../components/org/UnitTree.js';
import { useLabels } from '../../lib/labels.js';
import { useCan } from '../../lib/capabilities.js';
import { usePeopleSearch } from '../../lib/people.js';
import { useUnits } from '../../lib/units.js';
import { useSubjectList } from '../../lib/subjects.js';
import { useCampaignList } from '../../lib/campaigns.js';
import { useCapabilityCatalogue, useSimulator, type SimulationRecord } from '../../lib/simulator.js';

type TargetKind = SimulateTarget['kind'];

/** A blocked decision rejected ONLY by scope is the counterfactual `42` calls the most
 *  valuable line on the screen — everything else (a hard block, an expired grant, no grant
 *  at all) teaches a different lesson and gets its own line instead. */
function counterfactual(record: SimulationRecord): string | null {
  const { decision } = record;
  if (decision.allowed || decision.reason !== 'out_of_scope') return null;
  const nearMiss = decision.considered?.find(
    (entry) => entry.effect === 'allow' && entry.rejectedBecause?.includes('outside'),
  );
  if (!nearMiss) return null;
  return `This would be allowed if ${record.targetLabel} were within reach of that ${nearMiss.via} grant.`;
}

function PersonPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { userId: string; name: string } | null;
  onChange: (person: { userId: string; name: string } | null) => void;
}): JSX.Element {
  const [term, setTerm] = useState('');
  const results = usePeopleSearch(term);
  const withAccount = (results.data?.data ?? []).filter(
    (person): person is PersonSummary & { userId: string } => person.userId !== null,
  );

  if (value) {
    return (
      <span className="sim-blank sim-blank-filled">
        {value.name}{' '}
        <button type="button" className="btn btn-ghost btn-tiny" onClick={() => onChange(null)}>
          change
        </button>
      </span>
    );
  }

  return (
    <span className="sim-blank">
      <input
        className="input input-inline"
        placeholder={label}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      {term.trim().length >= 2 && (
        <ul className="sim-blank-results">
          {results.loading && <li className="text-meta">Searching…</li>}
          {!results.loading && withAccount.length === 0 && (
            <li className="text-meta">No one with an account matches.</li>
          )}
          {withAccount.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onChange({ userId: person.userId, name: person.name });
                  setTerm('');
                }}
              >
                {person.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export default function Simulator(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const catalogue = useCapabilityCatalogue();
  const units = useUnits();
  const sim = useSimulator();

  const [principal, setPrincipal] = useState<{ userId: string; name: string } | null>(null);
  // `Capability | ''`, not `string`. The file's own rule is that this sentence cannot ask
  // an invalid question; since the DTO started validating against the catalogue that rule
  // is the compiler's to keep rather than a comment's. `''` is the unchosen blank.
  const [capability, setCapability] = useState<Capability | ''>('');
  const [targetKind, setTargetKind] = useState<TargetKind>('org');
  const [targetUnitId, setTargetUnitId] = useState('');
  const [targetPerson, setTargetPerson] = useState<{ userId: string; name: string } | null>(null);
  const [targetSubjectId, setTargetSubjectId] = useState('');
  const [targetCampaignId, setTargetCampaignId] = useState('');
  const [at, setAt] = useState('');

  const [subjectTerm, setSubjectTerm] = useState('');
  const subjects = useSubjectList({ q: subjectTerm || undefined });
  const campaigns = useCampaignList();

  // 403 — THE ACCOUNT. The sidebar item is absent without `simulator.run`, so this is the
  // directly-typed address, and it must not read as a broken sentence.
  if (!can('simulator.run')) {
    return (
      <div className="page">
        <PageHeader
          title="Permission simulator"
          subtitle="Ask whether somebody could do something, and see exactly why."
        />
        <EmptyState
          icon="role"
          title="You do not have access to this"
          body="Your account cannot run the simulator. Whoever administers your organisation can change that."
        />
      </div>
    );
  }

  const targetReady =
    targetKind === 'org' ||
    (targetKind === 'unit' && targetUnitId !== '') ||
    (targetKind === 'person' && targetPerson !== null) ||
    (targetKind === 'subject' && targetSubjectId !== '') ||
    (targetKind === 'campaign' && targetCampaignId !== '');

  const ready = principal !== null && capability !== '' && targetReady;

  const targetLabel = useMemo(() => {
    if (targetKind === 'org') return 'the whole organisation';
    if (targetKind === 'unit') {
      return findUnitName(units.data ?? [], targetUnitId) ?? `that ${labels.unit.one.toLowerCase()}`;
    }
    if (targetKind === 'person') return targetPerson?.name ?? 'that person';
    if (targetKind === 'subject') {
      return subjects.data?.data.find((s) => s.id === targetSubjectId)?.name
        ?? `that ${labels.subject.one.toLowerCase()}`;
    }
    return campaigns.data?.data.find((c) => c.id === targetCampaignId)?.name ?? 'that campaign';
  }, [targetKind, targetUnitId, targetPerson, targetSubjectId, targetCampaignId, units.data, subjects.data, campaigns.data, labels]);

  const capabilityLabel =
    catalogue.data?.find((c) => c.key === capability)?.label ?? capability;

  const runTest = (): void => {
    // `ready` already asserts `capability !== ''`, and TypeScript narrows through the
    // alias — so `capability` is a `Capability` from here down with nothing restated.
    if (!ready || !principal) return;
    let target: SimulateTarget;
    if (targetKind === 'org') target = { kind: 'org' };
    else if (targetKind === 'unit') target = { kind: 'unit', unitId: targetUnitId };
    else if (targetKind === 'person') target = { kind: 'person', userId: targetPerson!.userId };
    else if (targetKind === 'subject') target = { kind: 'subject', subjectId: targetSubjectId };
    else target = { kind: 'campaign', campaignId: targetCampaignId };

    const query: SimulateBody = {
      principalUserId: principal.userId,
      capability,
      target,
      at: at ? new Date(at) : undefined,
    };
    void sim.run(query, { principalName: principal.name, targetLabel, capabilityLabel });
  };

  const latest = sim.history[0] ?? null;

  return (
    <div className="page simulator-page">
      <PageHeader
        title="Permission simulator"
        subtitle="Ask whether somebody could do something, and see exactly why."
      />

      <div className="card sim-sentence">
        <p className="sim-sentence-text">
          If{' '}
          <PersonPicker label="a person" value={principal} onChange={setPrincipal} /> tries to{' '}
          <span className="sim-blank">
            <select
              className="input input-inline"
              value={capability}
              onChange={(event) => {
                const next = event.target.value;
                // Every option but the placeholder came from the catalogue, so anything
                // that is not a capability IS the placeholder. Checked rather than cast.
                setCapability(isCapability(next) ? next : '');
              }}
              disabled={catalogue.loading}
            >
              <option value="">choose an action</option>
              {(catalogue.data ?? []).map((meta) => (
                <option key={meta.key} value={meta.key}>{meta.label}</option>
              ))}
            </select>
          </span>{' '}
          on{' '}
          <span className="sim-blank">
            <select
              className="input input-inline"
              value={targetKind}
              onChange={(event) => {
                setTargetKind(event.target.value as TargetKind);
                setTargetUnitId('');
                setTargetPerson(null);
                setTargetSubjectId('');
                setTargetCampaignId('');
              }}
            >
              <option value="org">the whole organisation</option>
              <option value="unit">a {labels.unit.one.toLowerCase()}</option>
              <option value="person">a person</option>
              <option value="subject">a {labels.subject.one.toLowerCase()}</option>
              <option value="campaign">a {labels.campaign.one.toLowerCase()}</option>
            </select>
          </span>

          {targetKind === 'unit' && (
            <span className="sim-blank sim-blank-unit">
              <UnitTree
                nodes={units.data ?? []}
                mode="select"
                selectedId={targetUnitId}
                onSelect={setTargetUnitId}
              />
            </span>
          )}
          {targetKind === 'person' && (
            <PersonPicker label="a person" value={targetPerson} onChange={setTargetPerson} />
          )}
          {targetKind === 'subject' && (
            <span className="sim-blank">
              <input
                className="input input-inline"
                placeholder={`Search ${labels.subject.many.toLowerCase()}`}
                value={subjectTerm}
                onChange={(event) => setSubjectTerm(event.target.value)}
              />
              <select
                className="input input-inline"
                value={targetSubjectId}
                onChange={(event) => setTargetSubjectId(event.target.value)}
              >
                <option value="">choose one</option>
                {(subjects.data?.data ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </span>
          )}
          {targetKind === 'campaign' && (
            <span className="sim-blank">
              <select
                className="input input-inline"
                value={targetCampaignId}
                onChange={(event) => setTargetCampaignId(event.target.value)}
              >
                <option value="">choose one</option>
                {(campaigns.data?.data ?? []).map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </span>
          )}

          {' '}on{' '}
          <span className="sim-blank">
            <input
              type="date"
              className="input input-inline"
              value={at}
              onChange={(event) => setAt(event.target.value)}
            />
          </span>

          <button
            type="button"
            className="btn btn-primary sim-test"
            disabled={!ready || sim.running}
            onClick={runTest}
          >
            {sim.running ? 'Testing…' : 'Test'}
          </button>
        </p>
        <p className="text-meta">
          Every blank comes from something real in your organisation — there is no way to ask
          an invalid question.
        </p>
      </div>

      {sim.forbidden && (
        <p className="form-error" role="alert">
          You do not have permission to run the simulator.
        </p>
      )}
      {sim.error && (
        <p className="form-error" role="alert">
          That did not run. {sim.error}
        </p>
      )}

      {latest && (
        <div className={`card sim-verdict ${latest.decision.allowed ? 'is-allow' : 'is-deny'}`}>
          <p className="sim-verdict-headline">
            {latest.decision.allowed ? 'ALLOWED' : 'BLOCKED'}
          </p>

          {!latest.decision.allowed && latest.decision.reason === 'no_grant' && (
            <p className="sim-verdict-line">No rule grants this.</p>
          )}

          {!latest.decision.allowed && latest.decision.reason === 'explicit_deny' && (
            <p className="sim-verdict-line">
              Hard block on <strong>{latest.decision.decidedBy?.subjectName ?? 'a role'}</strong>.
              Cannot be overridden by any team or grant.
            </p>
          )}

          <DecisionTrace
            decision={{
              decidedBy: latest.decision.decidedBy ?? null,
              // Omitted rather than passed as undefined: `<DecisionTrace>` treats an
              // ABSENT `considered` as "this response carried no candidate list" and
              // drops the section, which is exactly a production 403 (`11` §10). An
              // explicit undefined would mean the same at runtime and fail the type.
              ...(latest.decision.considered ? { considered: latest.decision.considered } : {}),
              tense: 'present',
            }}
          />

          {counterfactual(latest) && (
            <p className="sim-counterfactual">{counterfactual(latest)}</p>
          )}
        </div>
      )}

      {!latest && !sim.running && (
        <EmptyState
          icon="role"
          title="Nothing tested yet"
          body="Fill in the sentence above and press Test to see the decision and exactly why it was made."
        />
      )}

      {sim.history.length > 1 && (
        <div className="sim-history">
          <p className="text-meta sim-history-heading">Earlier this session</p>
          <ul>
            {sim.history.slice(1).map((record) => (
              <li key={record.id} className="sim-history-row">
                <span>
                  {record.principalName} · {record.capabilityLabel} · {record.targetLabel}
                </span>
                <span className={`tag ${record.decision.allowed ? 'tag-good' : 'tag-bad'}`}>
                  {record.decision.allowed ? 'Allowed' : 'Blocked'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function findUnitName(nodes: Array<{ id: string; name: string; children: unknown[] }>, id: string): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    const found = findUnitName(node.children as typeof nodes, id);
    if (found) return found;
  }
  return undefined;
}
