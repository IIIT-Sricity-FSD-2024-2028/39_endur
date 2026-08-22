// The column beside the sign-in and create-organization forms. 30 § Sign in, § Create.
//
// Three facts, not three selling points. Somebody on `/login` already knows what Endur is;
// somebody on `/start` is deciding whether the next two minutes are worth spending. Both
// are served by the same three answers — what it costs to set up, what the people answering
// have to do, and who ends up able to see what — so this is one component with one set of
// copy rather than two that drift.
//
// No domain nouns (INV-001): there is no organisation signed in on either screen, so there
// is no vocabulary to resolve and nothing here may assume one.
import { Icon, type IconName } from '../../components/Icon.js';

const POINTS: ReadonlyArray<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'structure',
    title: 'Set up once, in your words',
    body:
      'Start from the preset closest to what you run, then rename anything that does not fit. Every screen picks the change up.',
  },
  {
    icon: 'qr',
    title: 'Answering needs no account',
    body:
      'People answer from a link or a printed code. No app, no password, and nothing for them to install.',
  },
  {
    icon: 'hide',
    title: 'Anonymous means anonymous',
    body:
      'Responses are stored with no column that could identify who wrote one. Endur can count them and still not know whose is whose.',
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
