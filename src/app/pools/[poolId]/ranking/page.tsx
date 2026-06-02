import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getMembership } from "@/server/pools";
import { computeStandings } from "@/server/ranking";
import { RankingTable } from "@/components/RankingTable";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function RankingPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const session = await requireSession();

  // Membership guard: only members of this pool may see its standings.
  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  const rows = await computeStandings(poolId);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6">
      <AppNav poolId={poolId} />
      <AutoRefresh />
      <h1 className="text-2xl font-bold">Ranking</h1>
      <RankingTable rows={rows} />
    </main>
  );
}
