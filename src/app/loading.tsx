/**
 * Route-level loading fallback (Next 16 App Router). A lightweight skeleton
 * shown while server components stream in, instead of a blank screen. The pulse
 * animation is neutralized by the global prefers-reduced-motion rule.
 */
export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Carregando"
      className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10"
    >
      <div className="h-8 w-1/2 animate-pulse rounded-md bg-fundo-secao" />
      <div className="flex flex-col gap-3">
        <div className="h-20 animate-pulse rounded-md bg-fundo-secao" />
        <div className="h-20 animate-pulse rounded-md bg-fundo-secao" />
        <div className="h-20 animate-pulse rounded-md bg-fundo-secao" />
      </div>
    </main>
  );
}
