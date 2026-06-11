/**
 * Skeleton for the ranking: header row + member rows matching the table's
 * real heights, so the standings appear without layout shift.
 */
export default function RankingLoading() {
  return (
    <main
      role="status"
      aria-label="Carregando ranking"
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6"
    >
      <div className="h-10 border-b border-border" />
      <div className="h-8 w-32 animate-pulse rounded-md bg-surface-muted" />
      <div className="flex animate-pulse flex-col">
        <div className="flex justify-between border-b border-border px-2 py-2">
          <div className="h-4 w-24 rounded bg-surface-muted" />
          <div className="h-4 w-28 rounded bg-surface-muted" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-surface-muted px-2 py-2"
          >
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-surface-muted" />
              <div className="h-4 w-32 rounded bg-surface-muted" />
            </div>
            <div className="h-4 w-16 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </main>
  );
}
