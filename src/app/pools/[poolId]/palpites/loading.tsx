/**
 * Skeleton for the palpites list: mirrors the real layout (title, then match
 * cards with a teams line + stepper line) so content pops in without layout
 * shift. Pulsing blocks instead of a spinner (mobile-first perceived speed).
 */
export default function PalpitesLoading() {
  return (
    <main
      role="status"
      aria-label="Carregando palpites"
      className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10"
    >
      <div className="h-10 border-b border-border" />
      <div className="h-8 w-40 animate-pulse rounded-md bg-surface-muted" />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col gap-3 rounded-md border border-border p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="h-5 w-28 rounded bg-surface-muted" />
            <div className="h-5 w-28 rounded bg-surface-muted" />
          </div>
          <div className="mx-auto h-11 w-64 rounded-md bg-surface-muted" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 rounded bg-surface-muted" />
            <div className="h-9 w-20 rounded-md bg-surface-muted" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </main>
  );
}
