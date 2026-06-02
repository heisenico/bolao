"use client";

import { useEffect } from "react";
import { Button } from "@/components/Button";

/**
 * Route error boundary (Next 16 App Router). Shows an app-styled pt-BR fallback
 * instead of the framework's default error page, with a recovery action.
 * `unstable_retry` (v16.2+) re-fetches and re-renders; falls back to `reset`.
 */
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div role="alert" className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">Algo deu errado</h1>
        <p className="text-sm text-texto-suave">
          Tivemos um problema ao carregar esta página. Tente novamente em alguns
          instantes.
        </p>
      </div>
      <Button type="button" onClick={() => (unstable_retry ?? reset)()}>
        Tentar de novo
      </Button>
    </main>
  );
}
