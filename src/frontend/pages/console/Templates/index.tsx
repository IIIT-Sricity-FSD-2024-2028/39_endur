// T-035 — /app/templates. 36, design_specs/design/05 §5.1.
//
// **Never start from a blank form.** That is the whole job of this screen, and it is why
// the empty state's primary action is "Browse the library" and the blank-form button is a
// quiet secondary in the header. A blank start is the enemy: it is where a customer either
// gives up or writes forty questions.
//
// Two lists on one page, and they are genuinely two things — the shared library
// (`orgId IS NULL`, one copy for everybody) and the org's own. The library is fetched once
// and filtered in the browser; the org's own is paginated by the server. See lib/templates.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PRESET_VOCABULARIES, type TemplateSummary } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog.js';
import { Toast } from '../../../components/feedback/Toast.js';
import { Icon } from '../../../components/Icon.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { useAppSelector } from '../../../store/index.js';
import { ApiError } from '../../../lib/api.js';
import { cloneKey, useTemplateLibrary, useTemplates } from '../../../lib/templates.js';
import { TemplateCard } from './TemplateCard.js';
import { PreviewDialog } from './PreviewDialog.js';
import { deleteConsequence } from './consequence.js';
import { BlankFormDialog } from './BlankFormDialog.js';

/** `all` is a real choice the reader makes, distinct from "no choice made yet". */
const ALL = 'all';

/**
 * Endur's own name for a preset. NOT a domain noun — the customer never renames "Hotel",
 * it is the name of a starting point we ship. `PRESET_VOCABULARIES` is the shared data
 * behind the landing page's switcher, so the two cannot drift; anything it does not carry
 * (`custom`) falls back to the key itself.
 */
function industryName(key: string): string {
  const preset = PRESET_VOCABULARIES.find((entry) => entry.key === key);
  return preset?.displayName ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export default function Templates(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const navigate = useNavigate();
  const orgIndustry = useAppSelector((state) => state.auth.org?.industry) ?? '';
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  // 36 § State: the filter DEFAULTS to the org's own industry — a hotel should not have to
  // filter past university templates to find theirs — but every other industry stays one
  // click away rather than hidden. An absent param means "not chosen yet", which is why
  // the default is applied here and not written into the URL behind the reader's back.
  const industry = params.get('industry') ?? orgIndustry;

  const library = useTemplateLibrary();
  const own = useTemplates({ q });

  const [term, setTerm] = useState(q);
  const [blank, setBlank] = useState(false);
  const [pending, setPending] = useState<TemplateSummary | null>(null);
  /** The template being looked at in the quick-look dialog, if any. */
  const [preview, setPreview] = useState<TemplateSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{ id: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const message = (error: unknown, fallback: string): string =>
    error instanceof ApiError ? error.message : fallback;

  const setFilter = (patch: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('cursor');
    setParams(next);
  };

  const libraryRows = useMemo(() => {
    const rows = library.data ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (industry !== ALL && industry && row.industry && row.industry !== industry) return false;
      if (category && row.category !== category) return false;
      if (!needle) return true;
      return `${row.name} ${row.description ?? ''}`.toLowerCase().includes(needle);
    });
  }, [library.data, industry, category, q]);

  /** Every category present in the library, so a chip never leads to an empty grid. */
  const categories = useMemo(() => {
    const present = new Set((library.data ?? []).map((row) => row.category));
    return [...present].sort();
  }, [library.data]);

  const industries = useMemo(() => {
    const present = new Set(
      (library.data ?? []).map((row) => row.industry).filter((key): key is string => Boolean(key)),
    );
    return [...present].sort();
  }, [library.data]);

  const ownRows = own.data?.data ?? [];
  const filtered = Boolean(q || category || (industry && industry !== ALL));

  /** Clone, then land in the builder. One action, no intermediate confirmation (36). */
  const use = (template: TemplateSummary): void => {
    setBusyId(template.id);
    setCardError(null);
    void own
      .clone(template.id, cloneKey(template.id))
      .then((created) => navigate(`/app/forms/${created.id}/build`))
      .catch((error: unknown) => {
        setCardError({ id: template.id, text: message(error, 'That could not be copied.') });
      })
      .finally(() => setBusyId(null));
  };

  const verdict = pending ? deleteConsequence(pending, labels.campaign) : null;

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Start from a ready-made form, or build your own."
        filters={[
          ...(q ? [{ label: `Search: ${q}`, onClear: () => { setTerm(''); setFilter({ q: null }); } }] : []),
          ...(category ? [{ label: category, onClear: () => setFilter({ category: null }) }] : []),
        ]}
        action={
          can('template.create') ? (
            <button type="button" className="btn btn-secondary" onClick={() => setBlank(true)}>
              <Icon name="add" size={18} /> Blank form
            </button>
          ) : undefined
        }
      />

      <div className="card list-controls list-toolbar">
        <form
          className="list-search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ q: term.trim() || null });
          }}
        >
          <label className="sr-only" htmlFor="template-search">Search templates</label>
          <input
            id="template-search"
            className="input"
            value={term}
            placeholder="Search templates"
            onChange={(event) => setTerm(event.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
      </div>

      {/* The industry segments. A radiogroup rather than buttons, so arrow keys work and
          the current choice is announced as chosen rather than as pressed. */}
      <div className="segmented" role="radiogroup" aria-label="Industry">
        {[ALL, ...industries].map((key) => (
          <label className={`segment${industry === key ? ' is-active' : ''}`} key={key}>
            <input
              type="radio"
              name="industry"
              checked={industry === key}
              onChange={() => setFilter({ industry: key })}
            />
            <span>{key === ALL ? 'All' : industryName(key)}</span>
          </label>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="chip-row">
          {categories.map((name) => (
            <button
              type="button"
              key={name}
              className={`tag tag-outline${category === name ? ' is-active' : ''}`}
              aria-pressed={category === name}
              onClick={() => setFilter({ category: category === name ? null : name })}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {(library.error ?? own.error) && (
        <p className="form-error" role="alert">
          {message(library.error ?? own.error, 'Could not load templates.')}{' '}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { void library.reload(); void own.reload(); }}
          >
            Try again
          </button>
        </p>
      )}

      <section className="tsection">
        <h3 className="tsection-head">Your templates</h3>
        {own.loading && !own.data ? (
          <CardSkeletons />
        ) : ownRows.length === 0 ? (
          <EmptyState
            icon="template"
            title="No forms yet"
            body={
              // Not "create a blank one". A blank form is where somebody either gives up or
              // writes forty questions, and both are the problem this product exists for.
              'Every form here starts as a copy of one below. Pick the closest one and change it — that is faster than starting from nothing, and it is shorter.'
            }
            action={
              <a className="btn btn-primary" href="#library">Browse the library</a>
            }
          />
        ) : (
          <div className="tgrid">
            {ownRows.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                campaign={labels.campaign}
                busy={busyId === template.id}
                error={cardError?.id === template.id ? cardError.text : undefined}
                onPreview={() => setPreview(template)}
                onOpen={() => navigate(`/app/forms/${template.id}/build`)}
                {...(can('template.delete') ? { onDelete: () => setPending(template) } : {})}
              />
            ))}
          </div>
        )}
      </section>

      <section className="tsection" id="library">
        <h3 className="tsection-head">Library</h3>
        {library.loading && !library.data ? (
          <CardSkeletons />
        ) : libraryRows.length === 0 ? (
          <EmptyState
            icon="template"
            title="No templates for that combination"
            body="Nothing in the library matches what you asked for. Clearing the filters brings the rest back."
            action={
              filtered ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setTerm(''); setFilter({ q: null, category: null, industry: ALL }); }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="tgrid">
            {libraryRows.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                campaign={labels.campaign}
                busy={busyId === template.id}
                error={cardError?.id === template.id ? cardError.text : undefined}
                onPreview={() => setPreview(template)}
                {...(can('template.clone') ? { onUse: () => use(template) } : {})}
              />
            ))}
          </div>
        )}
      </section>

      {preview && (
        <PreviewDialog
          template={preview}
          busy={busyId === preview.id}
          onClose={() => setPreview(null)}
          {...(preview.isLibrary
            ? can('template.clone')
              ? { onUse: () => { const target = preview; setPreview(null); use(target); } }
              : {}
            : { onOpen: () => navigate(`/app/forms/${preview.id}/build`) })}
        />
      )}

      {blank && (
        <BlankFormDialog
          onCancel={() => setBlank(false)}
          onCreate={async (body) => {
            const created = await own.create(body);
            navigate(`/app/forms/${created.id}/build`);
          }}
        />
      )}

      {pending && verdict && (
        <ConfirmDialog
          title={`Delete ${pending.name}?`}
          consequence={verdict.consequence}
          verb="Delete"
          destructive
          confirmDisabled={verdict.blocked}
          onConfirm={() => {
            const template = pending;
            setPending(null);
            void own
              .remove(template.id)
              .then(() => setToast(`${template.name} deleted.`))
              .catch((error: unknown) => {
                // Reachable even with the count in hand: a campaign created in another tab
                // between the load and the press makes the server the only authority.
                setCardError({ id: template.id, text: message(error, 'That could not be deleted.') });
              });
          }}
          onCancel={() => setPending(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

/** Card skeletons, at the grid's shape — 36 § States. Never a centred spinner. */
function CardSkeletons(): JSX.Element {
  return (
    <div className="tgrid" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div className="card tcard is-skeleton" key={index}>
          <span className="skeleton-row" />
          <span className="skeleton-row wide" />
          <span className="skeleton-row" />
        </div>
      ))}
    </div>
  );
}
