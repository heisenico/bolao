import { requireSession } from "@/lib/session";
import { getKnockoutMatches } from "@/server/results";
import { buildBracket } from "@/domain/bracket";
import { Bracket } from "@/components/Bracket";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  await requireSession();
  const matches = await getKnockoutMatches();
  const columns = buildBracket(matches);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-[#333333]">Mata-mata</h1>
      {/* football-data.org has not published knockout fixtures yet, so today the
          Bracket renders its own "aparece após a fase de grupos" empty state. */}
      <Bracket columns={columns} />
    </main>
  );
}
