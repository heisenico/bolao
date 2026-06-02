import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getMembership } from "@/server/pools";
import { getKnockoutMatches } from "@/server/results";
import { buildBracket } from "@/domain/bracket";
import { Bracket } from "@/components/Bracket";
import { AppNav } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function BracketPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const session = await requireSession();

  // Membership guard keeps the bolão nav context consistent (the bracket data
  // itself is tournament-wide, the same for every pool).
  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  const matches = await getKnockoutMatches();
  const columns = buildBracket(matches);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <AppNav poolId={poolId} />
      <h1 className="mb-4 text-2xl font-bold text-ink">Mata-mata</h1>
      <Bracket columns={columns} />
    </main>
  );
}
