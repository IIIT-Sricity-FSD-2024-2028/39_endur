// The operator's message to an organisation's administrators. Controlled: the words are the
// organisation page's (`state.operator.orgs[id].message`), so a failed send keeps them and a
// sent one empties the box.
export function MessageComposer({
  recipients,
  subject,
  body,
  onEdit,
  onSend,
  sending = false,
}: {
  recipients: { name: string; email: string }[];
  subject: string;
  body: string;
  onEdit: (patch: { subject?: string; body?: string }) => void;
  onSend: () => void;
  sending?: boolean;
}): JSX.Element {
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <form
      className="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        onSend();
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
          onChange={(event) => onEdit({ subject: event.target.value })}
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
          onChange={(event) => onEdit({ body: event.target.value })}
          maxLength={5000}
          required
        />
      </label>

      {/* `70` § Interactions: a composer that implies an email was sent when none was is
          worse than one that says what it did. There is no mail transport: the message is
          written to each administrator's inbox (`notification` rows, "From Endur") and to
          the platform audit log. It used to say "and sent by email", which nothing did. */}
      <p className="text-meta">
        This lands in their Endur inbox, under From Endur, and is recorded in the platform
        audit log. Nothing is emailed, and there is no reply thread inside Endur.
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
