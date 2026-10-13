export function Placeholder({ title, task }: { title: string; task: string }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <p className="text-muted">Not built yet — {task}.</p>
    </section>
  );
}
