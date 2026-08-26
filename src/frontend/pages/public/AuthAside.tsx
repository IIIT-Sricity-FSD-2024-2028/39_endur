// The column beside the sign-in and create-organization forms. 30 A  Sign in, A  Create.
//
// Three facts, not three selling points. Somebody on `/login` already knows what Endur is;
// somebody on `/start` is deciding whether the next two minutes are worth spending. Both
// are served by the same three answers ?" what it costs to set up, what the people answering
// have to do, and who ends up able to see what ?" so this is one component with one set of
// copy rather than two that drift.
//
// No domain nouns (INV-001): there is no organisation signed in on either screen, so there
// is no vocabulary to resolve and nothing here may assume one.
import { Icon, type IconName } from '../../components/Icon.js';

const POINTS: ReadonlyArray<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'structure',
    title: 'Dynamic organizational structure',
    body:
      'The platform adapts to your terminology. Define your own vocabulary during setup, and the entire interface will instantly match your industry\'s domain.',
  },
  {
    icon: 'qr',
    title: 'Frictionless response collection',
    body:
      'Respondents never need to create an account or install an app. Feedback is gathered instantly via secure links or printed QR codes.',
  },
  {
    icon: 'hide',
    title: 'Strict anonymity',
    body:
      'Anonymity is enforced at the database level. Responses are decoupled from identities, and data is only aggregated when it meets privacy thresholds.',
  },
];

export function AuthAside(): JSX.Element {
  return (
    <aside className="auth-aside" aria-label="What to expect">
      <h2 className="auth-aside-title">What you get</h2>
      <ul className="auth-points">
        {POINTS.map((point) => (
          <li className="auth-point" key={point.title}>
            <span className="auth-point-mark" aria-hidden="true">
              <Icon name={point.icon} size={16} />
            </span>
            <div>
              <p className="auth-point-title">{point.title}</p>
              <p className="auth-point-body">{point.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

