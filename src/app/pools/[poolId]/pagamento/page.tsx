import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCentsBRL } from "@/lib/money";
import { getMembership } from "@/server/pools";
import { AppNav } from "@/components/AppNav";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { markPaidPoolAction } from "@/app/pagamento/actions";

/**
 * The guided Pix screen: fee in large type, the organizer's key one tap away,
 * and the "Já paguei" report. Reachable any time from the pool screen banner.
 * Payment NEVER blocks predicting — this screen is informative, not a gate.
 */
export default async function PagamentoPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const session = await requireSession();

  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: { nome: true, valorEntrada: true, chavePix: true },
  });
  if (!pool) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav poolId={poolId} />
      <h1 className="text-2xl font-bold break-words">{pool.nome}</h1>

      {pool.valorEntrada === 0 ? (
        <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-soft p-4">
          <h2 className="text-lg font-semibold">Bolão sem entrada</h2>
          <p className="text-sm text-ink-strong">
            Este bolão não tem valor de entrada — nada a pagar, só palpitar. 🎉
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface-soft p-6 text-center">
            <h2 className="text-sm font-semibold text-ink-soft">
              Valor de entrada
            </h2>
            <p className="text-4xl font-bold">{formatCentsBRL(pool.valorEntrada)}</p>
            <p className="text-sm text-ink-strong">
              Pague o valor via PIX para o organizador e depois toque em
              &quot;Já paguei&quot;.
            </p>
          </section>

          <section className="flex flex-col gap-2 rounded-md border border-border p-4">
            <h2 className="font-semibold">Chave PIX do organizador</h2>
            <p className="break-all text-sm font-semibold">{pool.chavePix}</p>
            <div>
              <CopyButton text={pool.chavePix ?? ""} label="Copiar chave PIX" />
            </div>
          </section>

          {membership.paymentStatus === "pendente" ? (
            <form action={markPaidPoolAction} className="flex flex-col gap-2">
              <input type="hidden" name="poolId" value={poolId} />
              <SubmitButton pendingLabel="Registrando...">Já paguei</SubmitButton>
              <p className="text-center text-xs text-ink-muted">
                Avisa o organizador para ele conferir e confirmar.
              </p>
            </form>
          ) : membership.paymentStatus === "pago" ? (
            <p
              role="status"
              className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
            >
              ⏳ Pagamento informado — aguardando confirmação do organizador.
            </p>
          ) : (
            <p
              role="status"
              className="rounded-md bg-accent/10 p-3 text-sm font-semibold text-accent-strong"
            >
              ✓ Pagamento confirmado. Bom jogo!
            </p>
          )}
        </>
      )}

      <a href={`/pools/${poolId}`} className="text-accent-strong underline">
        Voltar ao bolão
      </a>
    </main>
  );
}
