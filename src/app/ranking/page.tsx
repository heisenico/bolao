import { requireSession } from "@/lib/session";
import { getCurrentMembership } from "@/server/pools";
import { computeStandings } from "@/server/ranking";
import { RankingTable } from "@/components/RankingTable";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const session = await requireSession();

  const membership = await getCurrentMembership(session.user.id);
  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
        <AppNav />
        <h1 className="text-2xl font-bold">Ranking</h1>
        <p>Você ainda não entrou em um bolão.</p>
        <a href="/pools/new" className="text-accent-strong underline">
          Criar um bolão
        </a>
      </main>
    );
  }

  const rows = await computeStandings(membership.poolId);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6">
      <AppNav />
      <AutoRefresh />
      <h1 className="text-2xl font-bold">Ranking</h1>
      <RankingTable rows={rows} />
    </main>
  );
}
