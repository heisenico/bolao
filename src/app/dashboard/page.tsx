import { requireSession } from "@/lib/session";
import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LOCK_LEAD_MS, isMatchLocked } from "@/domain/deadline";
import { getCurrentMembership } from "@/server/pools";
import { Flag } from "@/components/Flag";
import { SubmitButton } from "@/components/SubmitButton";
import { AppNav } from "@/components/AppNav";
import { AutoRefresh } from "@/components/AutoRefresh";

function formatSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function DashboardPage() {
  const session = await requireSession();

  const membership = await getCurrentMembership(session.user.id);
  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
        <AppNav />
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-ink-soft">
          Você está logado como{" "}
          <span className="font-medium break-words">{session.user?.email}</span>.
        </p>
        <p>Você ainda não entrou em um bolão.</p>
        <a href="/pools/new" className="text-accent-strong underline">
          Criar um bolão
        </a>
        <form action={logout}>
          <SubmitButton variant="secondary" pendingLabel="Saindo...">
            Sair
          </SubmitButton>
        </form>
      </main>
    );
  }

  const now = new Date();

  const nextMatches = await prisma.match.findMany({
    where: { status: { in: ["agendada", "ao_vivo"] } },
    orderBy: { dataHora: "asc" },
    take: 5,
    include: { homeTeam: true, awayTeam: true },
  });

  const predictions = await prisma.prediction.findMany({
    where: {
      membershipId: membership.id,
      matchId: { in: nextMatches.map((m) => m.id) },
    },
  });
  const predicted = new Set(predictions.map((p) => p.matchId));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav />
      <AutoRefresh />
      <h1 className="text-2xl font-bold">Próximos jogos</h1>

      {nextMatches.length === 0 ? (
        <p>
          Nenhum jogo agendado ainda. Eles aparecem assim que o organizador
          sincroniza a tabela.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {nextMatches.map((m) => {
            const locked = isMatchLocked(m.dataHora, now);
            const deadline = new Date(m.dataHora.getTime() - LOCK_LEAD_MS);
            const done = predicted.has(m.id);
            return (
              <li
                key={m.id}
                className="flex flex-col gap-1 rounded-md border border-border p-4"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex min-w-0 items-center gap-2">
                    <Flag
                      codigoPais={m.homeTeam.codigoPais}
                      bandeira={m.homeTeam.bandeira}
                      className="h-4 w-6 shrink-0 object-cover"
                    />
                    <span className="min-w-0 truncate">{m.homeTeam.nome}</span>
                  </span>
                  <span>x</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">{m.awayTeam.nome}</span>
                    <Flag
                      codigoPais={m.awayTeam.codigoPais}
                      bandeira={m.awayTeam.bandeira}
                      className="h-4 w-6 shrink-0 object-cover"
                    />
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-ink-soft">
                  <span>Jogo: {formatSaoPaulo(m.dataHora)}</span>
                  <span>Prazo: {formatSaoPaulo(deadline)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className={done ? "text-accent-strong" : "text-ink-muted"}>
                    {done ? "palpite feito" : "palpite pendente"}
                  </span>
                  <span className="text-ink-muted">
                    {locked ? "travado" : "aberto"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <a href="/palpites" className="text-accent-strong underline">
        Fazer/editar palpites
      </a>
      <form action={logout}>
        <SubmitButton variant="secondary" pendingLabel="Saindo...">
          Sair
        </SubmitButton>
      </form>
    </main>
  );
}
