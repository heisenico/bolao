export default function VerifyRequestPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Verifique seu e-mail</h1>
      <p className="text-sm text-ink-soft">
        Enviamos um link de acesso para o seu e-mail. Clique no link para entrar
        no Bolão da Copa 2026.
      </p>
      <p className="text-xs text-ink-muted">
        Em ambiente de desenvolvimento, o link aparece no console do servidor.
      </p>
    </main>
  );
}
