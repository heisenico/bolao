import { requireSession } from "@/lib/session";
import { getAdminPool, OwnershipError } from "@/server/admin";
import { prizeSummary } from "@/server/payments";
import { getKnockoutMatches } from "@/server/results";
import { env } from "@/lib/env";
import { inviteUrl, whatsappShareUrl } from "@/domain/share";
import { formatCentsBRL } from "@/lib/money";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import {
  applyResultAction,
  cancelMatchAction,
  confirmPaymentAction,
  removeMemberAction,
  syncFixturesAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const session = await requireSession();
  const { poolId } = await params;

  // Owner-only screen: a non-owner gets a clear "não autorizado" state, never a
  // raw crash (CONTRACT §6, SPEC §8.7). getAdminPool throws OwnershipError for a
  // caller who does not own the pool.
  let pool: Awaited<ReturnType<typeof getAdminPool>>;
  try {
    pool = await getAdminPool(poolId, session.user.id);
  } catch (err) {
    if (err instanceof OwnershipError) {
      return (
        <main className="mx-auto max-w-md px-4 py-10">
          <div className="rounded-lg border border-[#CCCCCC] bg-[#FAFAFA] p-6 text-center">
            <h1 className="text-xl font-bold text-[#333333]">Não autorizado</h1>
            <p className="mt-2 text-sm text-[#666666]">
              Apenas o organizador do bolão pode acessar a administração.
            </p>
            <a href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-verde-acao underline">
              Voltar ao início
            </a>
          </div>
        </main>
      );
    }
    throw err;
  }

  const summary = await prizeSummary(poolId);
  const matches = await getKnockoutMatches();

  const join = inviteUrl(env.authUrl(), pool.inviteCode);
  const whatsapp = whatsappShareUrl(`Entra no bolão ${pool.nome}!`, join);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#333333]">Admin — {pool.nome}</h1>
        {/* Owner-only fixtures sync (CONTRACT §11.6) */}
        <form action={syncFixturesAction}>
          <input type="hidden" name="poolId" value={poolId} />
          <button
            type="submit"
            className="rounded-md border border-[#CCCCCC] bg-white px-3 py-2 text-sm font-semibold text-[#333333]"
          >
            Sincronizar jogos
          </button>
        </form>
      </div>

      {/* Prize summary (winner-takes-all, CONTRACT §4) */}
      <section className="rounded-lg border border-[#CCCCCC] bg-[#FAFAFA] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Prêmio</h2>
        <p className="mt-1 text-2xl font-bold text-verde-acao">{formatCentsBRL(summary.total)}</p>
        <p className="text-sm text-[#666666]">
          Ganhador atual: {summary.winner ? summary.winner.nome : "—"}
        </p>
      </section>

      {/* Manual result form (CONTRACT §11.1) */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Registrar/corrigir resultado</h2>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-[#999999]">
            Nenhum jogo de mata-mata disponível ainda. Sincronize os jogos.
          </p>
        ) : (
          <form action={applyResultAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="poolId" value={poolId} />
            <label className="flex flex-col text-sm">
              Jogo
              <select name="matchId" className="rounded-md border border-[#CCCCCC] p-2" required>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.homeNome} x {m.awayNome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              Casa
              <input
                type="number"
                name="placarHome"
                min={0}
                required
                className="w-16 rounded-md border border-[#CCCCCC] p-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              Fora
              <input
                type="number"
                name="placarAway"
                min={0}
                required
                className="w-16 rounded-md border border-[#CCCCCC] p-2"
              />
            </label>
            <button type="submit" className="rounded-md bg-verde-acao px-4 py-2 font-semibold text-white">
              Salvar resultado
            </button>
          </form>
        )}
        <p className="mt-2 text-xs text-[#999999]">
          W.O.: registre o 3×0 oficial aqui como resultado manual normal (CONTRACT §11.8).
        </p>
      </section>

      {/* Cancel a match (status cancelada, void points — CONTRACT §11.8) */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Cancelar jogo</h2>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-[#999999]">Nenhum jogo de mata-mata disponível ainda.</p>
        ) : (
          <form action={cancelMatchAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="poolId" value={poolId} />
            <label className="flex flex-col text-sm">
              Jogo
              <select name="matchId" className="rounded-md border border-[#CCCCCC] p-2" required>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.homeNome} x {m.awayNome}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-[#CC0000] px-4 py-2 font-semibold text-[#CC0000]"
            >
              Cancelar jogo
            </button>
          </form>
        )}
      </section>

      {/* Members + payments (CONTRACT §7) */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Participantes</h2>
        <ul className="mt-3 divide-y divide-[#EEEEEE]">
          {pool.memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm">
                {m.user.name ?? m.user.email}
                <span className="ml-2 text-xs text-[#999999]">[{m.paymentStatus}]</span>
              </span>
              <span className="flex gap-2">
                {m.paymentStatus !== "confirmado" && (
                  <form action={confirmPaymentAction}>
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-verde-acao px-3 py-1 text-sm font-semibold text-white"
                    >
                      Confirmar pagamento
                    </button>
                  </form>
                )}
                {m.userId !== pool.ownerId && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-[#CCCCCC] px-3 py-1 text-sm text-[#CC0000]"
                    >
                      Remover
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Invite / share (CONTRACT §8 admin invite section) */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Convidar</h2>
        <p className="mt-2 break-all text-sm text-[#666666]">{join}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyLinkButton url={join} />
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"
          >
            Compartilhar no WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
