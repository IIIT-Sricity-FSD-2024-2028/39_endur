// T-041 — /app. 46, design_specs/design/04 §4.1.
//
// The first screen after sign-in and the screen the org switcher lands on, which makes it
// the ten-second proof (22 §4): the same code renders Departments/Courses for a university
// and Wards/Services for a hospital, and the chips at the top change before anything else.
//
// Three rules govern it:
//
//   1. IT IS A HUB, NOT A DASHBOARD. Everything on it is a link to somewhere that does the
//      real work. Charts, trends and sentiment are `43`, and `43` is P3 — which is also why
//      <TrendChip> is not on the "today" card (CONF-017).
//   2. A SECTION THE CALLER CANNOT READ IS ABSENT (INV-003). The server omits the KEY, so
//      this file distinguishes "no permission" from "nothing yet" by asking whether the key
//      is there — not by inspecting a length. That distinction is the whole reason the two
//      empty states below can say different things.
//   3. EVERY NUMBER IS ALREADY GATED. The k-anonymity threshold is applied on the server to
//      the stats and to the comments both, so home cannot become a way to read a suppressed
//      campaign one aggregate at a time (46 § Acceptance).
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { StatWindows, type HomeView, type StatWindow } from '@endur/shared';
import { PageHeader } from '../../../components/layout/PageHeader.js';
import { StatCard } from '../../../components/data/StatCard.js';
import { EmptyState } from '../../../components/feedback/EmptyState.js';
import { ShareSheet } from '../../../components/feedback/ShareSheet.js';
import { Icon } from '../../../components/Icon.js';
import { AnnouncementBanner, unreadFor } from '../../../components/org/AnnouncementBanner.js';
import { useLabels } from '../../../lib/labels.js';
import { useCan } from '../../../lib/capabilities.js';
import { useHome } from '../../../lib/home.js';
import { markAnnouncementRead, useAnnouncements } from '../../../lib/announcements.js';
import { useAppSelector } from '../../../store/index.js';
import { RANGE_LABEL, promptCopy, statCards } from './cards.js';
import { CampaignCard } from './CampaignCard.js';
import { Recent } from './Recent.js';

type Campaign = NonNullable<HomeView['activeCampaigns']>[number];

export default function Home(): JSX.Element {
  const labels = useLabels();
  const can = useCan();
  const org = useAppSelector((state) => state.auth.org);
  // 30 days, not all time — DEC-031. The first thing anybody sees after signing in should
  // be recent activity; a lifetime total only goes up and asks nobody to do anything.
  const [range, setRange] = useState<StatWindow>('30d');
  const home = useHome(range);
  const [sharing, setSharing] = useState<Campaign | null>(null);
  /**
   * T-094. Unread announcements, at the top of the first screen after sign-in — which is
   * where a notice has to be if it is going to be read at all.
   *
   * Fetched only when the reader holds `announcement.read`. It is seeded to every role
   * (50 §1), so this is about an explicit deny rather than the ordinary case; the hook
   * treats a 403 as an empty list either way.
   */
  const announcements = useAnnouncements(can('announcement.read'));
  /** Dismissed optimistically: the receipt write is a 204 with nothing to wait for. */
  const [dismissed, setDismissed] = useState<string[]>([]);

  const view = home.data;
  const orgName = org?.name ?? 'Your organisation';

  if (home.loading && !view) return <Skeleton title={orgName} />;

  if (!view) {
    return (
      <>
        <PageHeader title={orgName} />
        <div className="card home-error">
          <h3>That did not load</h3>
          <p className="text-muted">{home.error?.message ?? 'Something went wrong.'}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void home.reload()}>
            Try again
          </button>
        </div>
      </>
    );
  }

  // An unconfigured org's home is empty and confusing, so it is never shown (46 § States).
  // The wizard is the only useful thing there is to do, so it is where they go.
  if (!view.configured) return <Navigate to="/app/setup" replace />;

  const campaigns = view.activeCampaigns;
  const comments = view.recentComments;
  // Absent, not empty. `undefined` means the server withheld the section; `[]` means the
  // section is theirs and holds nothing yet. Those are two different sentences.
  const readsNothing = campaigns === undefined && comments === undefined;
  // `responsesEver`, NOT the windowed count — DEC-031. "This organisation has never
  // collected anything" and "nothing arrived in the last 30 days" are different sentences,
  // and reading the windowed number here would show a two-year-old organisation the
  // welcome screen — with its range control hidden — every quiet month.
  const isNew =
    !readsNothing && view.stats.responsesEver === 0 && (campaigns?.length ?? 0) === 0;

  const cards = statCards(view, labels);
  const prompts = view.prompts.map((prompt) => promptCopy(prompt, labels, orgName));
  const first = prompts[0];

  return (
    <>
      <PageHeader
        title={orgName}
        action={
          can('campaign.create') ? (
            <Link className="btn btn-primary" to="/app/campaigns/new">
              <Icon name="add" size={16} /> New {labels.campaign.one.toLowerCase()}
            </Link>
          ) : undefined
        }
      />

      {home.error && (
        // The rest of the shell stays usable and the numbers on screen stay on screen.
        <p className="form-error" role="alert">
          Could not refresh just now. These numbers are from the last successful load.
        </p>
      )}

      {/* Above everything, INCLUDING the "nothing assigned to you yet" state — somebody
          with no campaigns and no comments is exactly the person an announcement is for. */}
      <AnnouncementBanner
        items={unreadFor(announcements.rows.filter((row) => !dismissed.includes(row.id)))}
        onDismiss={(id) => {
          setDismissed((current) => [...current, id]);
          // Swallowed: the banner is already gone, and an error toast for a receipt the
          // reader did not ask to write would report our problem as theirs. It comes back
          // on the next load if the write really failed.
          void markAnnouncementRead(id).catch(() => undefined);
        }}
      />

      {readsNothing ? (
        <EmptyState
          icon="home"
          title="Nothing assigned to you yet"
          // A legitimate state for a junior role, and it must not look like an error: no
          // action, no explanation of what they are missing, no locks (46 § States).
          body="When you are given something to look after, it will show up here."
        />
      ) : isNew ? (
        // NOT four zeroed cards. Zeroes look broken; an empty state looks intentional, and
        // it carries the one next action instead of four numbers that all say nothing.
        <EmptyState
          icon="inbox"
          title={first?.title ?? `Add a ${labels.subject.one.toLowerCase()}`}
          body={
            first?.body ??
            `Nothing is collecting yet. Add a ${labels.subject.one.toLowerCase()} and start a ${labels.campaign.one.toLowerCase()}.`
          }
          action={
            <Link className="btn btn-primary" to={first?.href ?? '/app/subjects'}>
              {first?.action ?? `Add a ${labels.subject.one}`}
            </Link>
          }
        />
      ) : (
        <>
          {/* At most two, capped by the server. A dashboard that nags with six banners is
              a dashboard people stop reading (46 § Interactions). */}
          {prompts.length > 0 && (
            <ul className="home-prompts">
              {prompts.map((prompt) => (
                <li className="card home-prompt" key={prompt.title}>
                  <div>
                    <p className="home-prompt-title">{prompt.title}</p>
                    <p className="text-meta">{prompt.body}</p>
                  </div>
                  <Link className="btn btn-secondary" to={prompt.href}>
                    {prompt.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* The range owns the row beneath it and nothing else on the page, so it sits
              inside the band rather than up in the header beside "New campaign" — a
              control in the header would read as filtering the campaign list too. */}
          <div className="stat-band">
            <div className="stat-band-head">
              <h2 className="section-title">Activity</h2>
              <div className="segmented range-control" role="radiogroup" aria-label="Range">
                {StatWindows.map((option) => (
                  <label
                    className={`segment${range === option ? ' is-active' : ''}`}
                    key={option}
                  >
                    <input
                      type="radio"
                      name="range"
                      checked={range === option}
                      onChange={() => setRange(option)}
                    />
                    <span>{RANGE_LABEL[option]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* `aria-busy` rather than a spinner: the previous numbers stay on screen
                while the new range loads, so there is nothing to replace — only a fact to
                announce. Swapping four cards for four skeletons on every press would make
                the page jump more than the numbers change. */}
            <div className="stat-row" aria-busy={home.loading || undefined}>
              {cards.map((card) => (
                <StatCard
                  key={card.kicker}
                  kicker={card.kicker}
                  value={card.value}
                  context={card.context}
                />
              ))}
            </div>
          </div>

          <div className="home-columns">
            {campaigns && (
              <section className="home-column">
                <h2 className="section-title">Active {labels.campaign.many.toLowerCase()}</h2>
                {campaigns.length === 0 ? (
                  <p className="text-muted">
                    Nothing is collecting right now.{' '}
                    {can('campaign.create') && (
                      <Link to="/app/campaigns/new">
                        Start a {labels.campaign.one.toLowerCase()}
                      </Link>
                    )}
                  </p>
                ) : (
                  <ul className="home-campaigns">
                    {campaigns.map((campaign) => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        subjectWord={labels.subject.one}
                        onShare={() => setSharing(campaign)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Absent without `response.read`, not greyed — the key is not in the payload
                and there is nothing here to render from. */}
            {comments && (
              <div className="home-column">
                <Recent comments={comments} subjectWord={labels.subject.one} />
              </div>
            )}
          </div>
        </>
      )}

      {sharing?.url && (
        <ShareSheet
          url={sharing.url}
          campaignName={sharing.name}
          // Every campaign on this page is open by definition — the server asks for that
          // status and nothing else — so the sheet is told so rather than the payload
          // carrying a field with one possible value.
          status="open"
          endsAt={sharing.endsAt}
          anonymous={sharing.anonymous}
          access={sharing.access}
          onClose={() => setSharing(null)}
        />
      )}
    </>
  );
}

/** Skeletons at the real layout, so the page does not jump when the numbers land. */
function Skeleton({ title }: { title: string }): JSX.Element {
  return (
    <>
      <PageHeader title={title} />
      <div className="stat-row" aria-hidden="true">
        {[0, 1, 2, 3].map((slot) => (
          <div className="stat-card home-skeleton" key={slot} />
        ))}
      </div>
      <p className="sr-only">Loading</p>
    </>
  );
}
