// Every M0 route resolves to a real component from the first commit, so the route tree
// can be walked and tested before any screen exists (T-026). Each of these files is
// REPLACED WHOLESALE by the task named in it — they are a scaffold, not a stub to grow.
//
// Nothing here renders a domain noun. A placeholder that hardcodes one is exactly how
// INV-001 gets broken by accident — and audit:vocab catches it, including in this comment.
export function Placeholder({ title, task }: { title: string; task: string }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <p className="text-muted">Not built yet — {task}.</p>
    </section>
  );
}
