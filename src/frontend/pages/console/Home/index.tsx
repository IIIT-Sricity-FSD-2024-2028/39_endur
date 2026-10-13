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
  const [range, setRange] = useState<StatWindow>('30d');
  const home = useHome(range);
  const [sharing, setSharing] = useState<Campaign | null>(null);
  const announcements = useAnnouncements(can('announcement.read'));
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

  if (!view.configured) return <Navigate to="/app/setup" replace />;

  const campaigns = view.activeCampaigns;
  const comments = view.recentComments;
  const readsNothing = campaigns === undefined && comments === undefined;
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
          void markAnnouncementRead(id).catch(() => undefined);
        }}
      />

      {readsNothing ? (
        <EmptyState
          icon="home"
          title="Nothing assigned to you yet"
          body="When you are given something to look after, it will show up here."
        />
      ) : isNew ? (
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
