import { useEffect, useMemo, useState } from 'react';
import {
  Industry, LabelKey, resolveLabels,
  type LabelSet, type OrgView, type ResolvedLabels,
} from '@endur/shared';
import { PageHeader } from '../../components/layout/PageHeader.js';
import { WordsEditor, WordsTable } from '../../components/org/WordsEditor.js';
import { LeaveGuard } from '../../components/feedback/LeaveGuard.js';
import { DashboardPreview } from '../../components/org/DashboardPreview.js';
import { useCan } from '../../lib/capabilities.js';
import { ApiError } from '../../lib/api.js';
import { derivePlural } from '../../lib/format.js';
import { FileUpload } from '../../components/form/FileUpload.js';
import {
  useOrg, usePresets, useRemoveLogo, useUpdateLabels, useUpdateOrg, useUploadLogo,
} from '../../lib/org.js';
import { labelsLoaded, toastShown, useAppDispatch } from '../../store/index.js';

const overridesOf = (labels: ResolvedLabels): LabelKey[] =>
  LabelKey.options.filter((key) => labels[key].many !== derivePlural(labels[key].one));

const industryOf = (org: OrgView): Industry => {
  const parsed = Industry.safeParse(org.industry);
  return parsed.success ? parsed.data : 'custom';
};

const sameWords = (a: ResolvedLabels, b: ResolvedLabels): boolean =>
  LabelKey.options.every((key) => a[key].one === b[key].one && a[key].many === b[key].many);

export default function Settings(): JSX.Element {
  const can = useCan();
  const org = useOrg();
  const presets = usePresets();
  const dispatch = useAppDispatch();
  const updateOrg = useUpdateOrg();
  const updateLabels = useUpdateLabels();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();

  const editable = can('org.update');

  const [draft, setDraft] = useState<ResolvedLabels | null>(null);
  const [overrides, setOverrides] = useState<LabelKey[]>([]);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<Industry>('custom');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWords, setSavingWords] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [wordsError, setWordsError] = useState<string | null>(null);
  // The shell's ToastHost draws it (R-307); this page only says what happened.
  const showToast = (message: string): void => {
    dispatch(toastShown({ message }));
  };

  const loaded = org.data;
  useEffect(() => {
    if (!loaded) return;
    const resolved = resolveLabels(loaded.labels);
    setDraft(resolved);
    setOverrides(overridesOf(resolved));
    setName(loaded.name);
    setIndustry(industryOf(loaded));
  }, [loaded]);

  // WHAT IS UNSAVED, per card. Each Save wakes up only when its card differs from what the
  // server holds, says "Saved" otherwise, and leaving with either one unsaved asks first.
  const saved = useMemo(() => (loaded ? resolveLabels(loaded.labels) : null), [loaded]);
  const profileDirty =
    loaded !== null && (name.trim() !== loaded.name || industry !== industryOf(loaded));
  const wordsDirty = draft !== null && saved !== null && !sameWords(draft, saved);

  useEffect(() => {
    if (!draft || window.location.hash !== '#words') return;
    document.getElementById('words')?.scrollIntoView({ block: 'start' });
  }, [draft]);

  const industries = useMemo(
    () => (presets.data ?? []).map((preset) => ({ key: preset.key, name: preset.displayName })),
    [presets.data],
  );
  const industryName = (key: string): string =>
    industries.find((entry) => entry.key === key)?.name ?? key.charAt(0).toUpperCase() + key.slice(1);

  const message = (error: unknown, fallback: string): string =>
    error instanceof ApiError ? error.message : fallback;

  const applied = (updated: OrgView): void => {
    org.set(updated);
    dispatch(labelsLoaded(updated.labels as LabelSet));
  };

  const saveProfile = (): void => {
    setSavingProfile(true);
    setProfileError(null);
    void updateOrg({ name: name.trim(), industry })
      .then((updated) => {
        applied(updated);
        showToast('Organization saved.');
      })
      .catch((error: unknown) => setProfileError(message(error, 'Could not save.')))
      .finally(() => setSavingProfile(false));
  };

  const saveWords = (): void => {
    if (!draft) return;
    setSavingWords(true);
    setWordsError(null);
    void updateLabels({ ...draft })
      .then((updated) => {
        applied(updated);
        showToast('Words saved. Every screen is using them now.');
      })
      .catch((error: unknown) =>
        setWordsError(message(error, 'Could not save those words.')))
      .finally(() => setSavingWords(false));
  };

  const setOne = (key: LabelKey, one: string): void =>
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: {
              one,
              many: overrides.includes(key) ? current[key].many : derivePlural(one),
            },
          }
        : current);

  const setMany = (key: LabelKey, many: string): void => {
    setDraft((current) => (current ? { ...current, [key]: { ...current[key], many } } : current));
    setOverrides((current) => (current.includes(key) ? current : [...current, key]));
  };

  const resetPlural = (key: LabelKey): void => {
    setDraft((current) =>
      current
        ? { ...current, [key]: { ...current[key], many: derivePlural(current[key].one) } }
        : current);
    setOverrides((current) => current.filter((entry) => entry !== key));
  };

  const blank = draft
    ? LabelKey.options.find((key) => !draft[key].one.trim() || !draft[key].many.trim())
    : undefined;

  if (org.loading) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="settings-page" aria-hidden="true">
          <div className="card settings-skeleton">
            <span className="skeleton-row" /><span className="skeleton-row wide" />
          </div>
          <div className="card settings-skeleton">
            <span className="skeleton-row" /><span className="skeleton-row wide" />
            <span className="skeleton-row wide" />
          </div>
        </div>
      </>
    );
  }

  if (!draft || !loaded) {
    return (
      <>
        <PageHeader title="Settings" />
        <p className="text-muted">{message(org.error, 'Could not load your settings.')}</p>
      </>
    );
  }

  // READ, NOT A FORM WITH EVERY FIELD SWITCHED OFF. Without `org.update` this page is only
  // reachable by typing its address (the sidebar item needs the power), and what it owes
  // that reader is the facts: a disabled input still looks like somewhere to type.
  if (!editable) {
    return (
      <>
        <PageHeader
          title="Settings"
          subtitle="How your organization is set up. Whoever manages it can change this."
        />
        <div className="settings-page">
          <section className="settings-card" aria-labelledby="settings-org">
            <h3 className="utility" id="settings-org">Organization</h3>
            <dl className="card settings-facts">
              <div className="settings-fact">
                <dt>Name</dt>
                <dd>{loaded.name}</dd>
              </div>
              <div className="settings-fact">
                <dt>Industry</dt>
                <dd>{industryName(industryOf(loaded))}</dd>
              </div>
              <div className="settings-fact">
                <dt>Logo</dt>
                <dd>
                  {loaded.logoUrl ? (
                    <img src={loaded.logoUrl} alt={`${loaded.name} logo`} className="file-preview shape-square" />
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="settings-card" id="words" aria-labelledby="settings-words">
            <h3 className="utility" id="settings-words">Official Terms</h3>
            <p className="text-muted">These appear throughout Endur.</p>
            <WordsTable labels={saved ?? draft} />
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" />
      <LeaveGuard when={profileDirty || wordsDirty} what="your changes to these settings" />

      <div className="settings-page">
        <section className="settings-card" aria-labelledby="settings-org">
          <h3 className="utility" id="settings-org">Organization</h3>
          <div className="card">
            <div className="field">
              <label htmlFor="org-name">Name</label>
              <input
                id="org-name"
                className="input"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="org-industry">Industry</label>
              <select
                id="org-industry"
                className="input"
                value={industry}
                disabled={industries.length === 0}
                onChange={(event) => setIndustry(event.target.value as Industry)}
              >
                {industries.map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.name}</option>
                ))}
              </select>
              {/* 41 § Interactions, verbatim. Re-seeding a configured org would destroy it,
                  so the copy has to say what this does NOT do. */}
              <p className="text-meta">This only changes which templates we suggest.</p>
            </div>

            {/* 48. `org.update` covers the logo too — an upload is an attribute of the
                thing it belongs to, not a permission of its own (11 §3). Without it the
                control renders read-only: the image shows, the actions do not. */}
            <FileUpload
              label="Logo"
              shape="square"
              current={org.data?.logoUrl ?? null}
              hint="PNG, JPEG or WebP, up to 2 MB. It is saved as soon as you choose it."
              onUpload={async (file) => {
                org.set(await uploadLogo(file));
              }}
              onRemove={async () => {
                org.set(await removeLogo());
              }}
            />

            {profileError && <p className="field-error" role="alert">{profileError}</p>}

            <div className="card-actions">
              {profileDirty && <span className="text-meta settings-unsaved">Unsaved changes</span>}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={savingProfile || !name.trim() || !profileDirty}
                onClick={saveProfile}
              >
                {savingProfile ? 'Saving…' : profileDirty ? 'Save organization' : 'Saved'}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card" id="words" aria-labelledby="settings-words">
          <h3 className="utility" id="settings-words">Official Terms</h3>
          <p className="text-muted">These appear throughout Endur. Change them any time.</p>

          <WordsEditor
            labels={draft}
            overrides={overrides}
            onSetOne={setOne}
            onSetMany={setMany}
            onResetPlural={resetPlural}
          />
          <DashboardPreview labels={draft} />

          {blank && <p className="field-error" role="alert">Every word needs a singular and a plural.</p>}
          {wordsError && <p className="field-error" role="alert">{wordsError}</p>}

          <div className="card-actions">
            {wordsDirty && <span className="text-meta settings-unsaved">Unsaved changes</span>}
            <button
              type="button"
              className="btn btn-primary"
              disabled={savingWords || Boolean(blank) || !wordsDirty}
              onClick={saveWords}
            >
              {savingWords ? 'Saving…' : wordsDirty ? 'Save words' : 'Saved'}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}


