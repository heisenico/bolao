import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { signOut } from "@/auth";
import { listUserMemberships } from "@/server/pools";
import { SubmitButton } from "@/components/SubmitButton";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

async function goToInvite(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (code) redirect(`/join/${code}`);
}

const PAYMENT_LABEL: Record<string, string> = {
  pendente: "pagamento pendente",
  pago: "aguardando confirmação",
  confirmado: "pagamento confirmado",
};

export default async function MeusBoloesPage() {
  const session = await requireSession();
  const memberships = await listUserMemberships(session.user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Meus bolões</h1>
        <p className="text-sm text-ink-soft break-words">
          {session.user?.email}
        </p>
      </div>

      {memberships.length === 0 ? (
        <p className="text-ink-soft">
          Você ainda não está em nenhum bolão. Crie o seu ou entre com um código
          de convite.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {memberships.map((m) => {
            const isOwner = m.pool.ownerId === session.user.id;
            return (
              <li key={m.id}>
                <Link
                  href={`/pools/${m.pool.id}`}
                  className="flex flex-col gap-1 rounded-md border border-border p-4 transition-colors hover:bg-surface-soft"
                >
                  <span className="font-semibold break-words">
                    {m.pool.nome}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {isOwner ? "organizador · " : ""}
                    {PAYMENT_LABEL[m.paymentStatus] ?? m.paymentStatus}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <Link
          href="/pools/new"
          className="text-accent-strong underline"
        >
          Criar um bolão
        </Link>

        <form action={goToInvite} className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Entrar com um código</span>
            <input
              name="code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              maxLength={12}
              placeholder="Ex.: ABC123"
              className="rounded-md border border-border px-3 py-2 uppercase"
            />
          </label>
          <SubmitButton variant="secondary" pendingLabel="Entrando...">
            Entrar
          </SubmitButton>
        </form>
      </div>

      <form action={logout}>
        <SubmitButton variant="secondary" pendingLabel="Saindo...">
          Sair
        </SubmitButton>
      </form>
    </main>
  );
}
