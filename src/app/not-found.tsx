import Link from "next/link";

/**
 * Root not-found UI (Next 16 App Router). Also handles unmatched URLs app-wide.
 * Server component, pt-BR, with a recovery link.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-ink-soft">
        O endereço que você abriu não existe ou o convite expirou.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md px-3 py-2 text-sm font-semibold text-accent-strong underline"
      >
        Voltar ao início
      </Link>
    </main>
  );
}
