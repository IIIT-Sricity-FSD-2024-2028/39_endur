// <MessageComposer> — `24` §6b, `70` § Interactions. Contact an org's administrators.
//
// NO RECIPIENT FIELD, and its absence is the acceptance criterion: recipients are resolved
// server-side from who holds `org.update` and shown here only for confirmation. An operator
// typing an address is an operator who can typo a customer's plan details to a stranger.
import { useState } from 'react';

export function MessageComposer({
  recipients,
  onSend,
  sending = false,
}: {
  recipients: { name: string; email: string }[];
  onSend: (subject: string, body: string) => Promise<void>;
  sending?: boolean;
}): JSX.Element {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <form
      className="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        void onSend(subject.trim(), body.trim());
      }}
    >
      <div className="message-composer-recipients">
        <span className="text-meta">To</span>
        {recipients.length === 0 ? (
          <span className="text-meta">No administrator to contact</span>
        ) : (
          recipients.map((person) => (
            <span className="tag tag-outline" key={person.email}>
              {person.name} · {person.email}
            </span>
          ))
        )}
      </div>

      <label className="field">
        <span className="field-label">Subject</span>
        <input
          className="input"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={200}
          required
        />
      </label>

      <label className="field">
        <span className="field-label">Message</span>
        <textarea
          className="input"
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={5000}
          required
        />
      </label>

      {/* `70` § Interactions: a composer that implies an email was sent when none was is
          worse than one that says what it did. There is no mail transport in P2 — the
          record IS the delivery, and the next operator reads it at `/platform/audit`. */}
      <p className="text-meta">
        This is recorded in the platform audit log and sent by email. There is no reply
        thread inside Endur — replies go to your support address.
      </p>

      <div className="message-composer-actions">
        <button type="submit" className="btn btn-primary" disabled={!canSend || recipients.length === 0}>
          {sending && <span className="spinner" aria-hidden="true" />}
          Send message
        </button>
      </div>
    </form>
  );
}
