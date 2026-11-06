import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  hasResponded, markResponded, submitResponse, usePublicCampaign, type DoneState,
} from '../../lib/respond.js';
import { RespondForm } from './RespondForm.js';
import { Unavailable } from './Unavailable.js';

// The `/r/:token` page: loading, the gates, and the thank-you page. The form itself is
// <RespondForm>, shared with the card on a signed-in member's Home page.
export default function Fill(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [already] = useState(() => (token ? hasResponded(token) : false));
  const { campaign, loading, unavailable, gate, error, reload } = usePublicCampaign(
    already ? undefined : token,
  );

  if (already) return <Unavailable variant="responded" />;
  if (loading) return <FormSkeleton />;
  if (unavailable) return <Unavailable variant="unavailable" />;
  if (gate) {
    return (
      <Unavailable
        variant={gate.kind}
        organizationName={gate.organizationName}
        signInHref={token ? `/login?next=${encodeURIComponent(`/r/${token}`)}` : '/login'}
      />
    );
  }
  if (error || !campaign || !token) return <Unavailable variant="error" onRetry={() => void reload()} />;

  return (
    <RespondForm
      token={token}
      campaign={campaign}
      channel="link"
      send={(body, key) => submitResponse(token, body, key)}
      onSent={(result, about) => {
        markResponded(token);
        const state: DoneState = {
          responseCount: result.responseCount,
          anonymous: campaign.anonymous,
          labels: campaign.labels,
          ...(about ? { subjectName: about } : {}),
        };
        navigate(`/r/${encodeURIComponent(token)}/done`, { state, replace: true });
      }}
    />
  );
}

const FormSkeleton = (): JSX.Element => (
  <div className="rf" aria-busy="true">
    <p className="sr-only">Loading</p>
    <div className="rf-skeleton" />
  </div>
);
