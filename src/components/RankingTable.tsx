import type { RankingRow } from "@/domain/ranking";

/** Avatar: the user's image if present, else a circle with their name initial. */
function Avatar({ nome, image }: { nome: string; image: string | null }) {
  if (image) {
    // Plain <img> (not next/image): remote avatar URLs, no loader config in v1.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={nome}
        className="h-7 w-7 rounded-full object-cover"
        width={28}
        height={28}
      />
    );
  }
  const initial = (nome.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-borda text-xs font-bold text-texto"
    >
      {initial}
    </span>
  );
}

/**
 * Detailed ranking (SPEC §6): position, avatar, name, pontos, nº de cravadas,
 * with the leader (first row) highlighted. Presentational only — UI never
 * imports prisma (CONTRACT §2); rows arrive pre-sorted from computeStandings.
 */
export function RankingTable({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) {
    return <p className="text-texto-mudo">Sem participantes ainda.</p>;
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-borda text-sm text-texto-mudo">
          <th scope="col" className="px-2 py-2">#</th>
          <th scope="col" className="px-2 py-2">Nome</th>
          <th scope="col" className="px-2 py-2 text-right">Pontos</th>
          <th scope="col" className="px-2 py-2 text-right">Cravadas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const isLeader = i === 0;
          return (
            <tr
              key={row.membershipId}
              data-leader={isLeader ? "true" : "false"}
              className={
                "border-b border-fundo-secao " +
                (isLeader ? "bg-verde-acao/10 font-bold" : "")
              }
            >
              <td className="px-2 py-2" data-cell="position">
                {i + 1}
              </td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <Avatar nome={row.nome} image={row.image} />
                  {row.nome}
                </span>
              </td>
              <td className="px-2 py-2 text-right" data-cell="pontos">
                {row.pontos}
              </td>
              <td className="px-2 py-2 text-right" data-cell="cravadas">
                {row.cravadas}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
