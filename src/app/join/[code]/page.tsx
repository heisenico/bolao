import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EntryClosedError, joinPool, getMembership } from "@/server/pools";
import { formatCentsBRL } from "@/lib/money";
import { CopyButton } from "@/components/CopyButton";
import { SubmitButton } from "@/components/SubmitButton";
import { markPaidAction } from "./actions";

export default async function JoinPoolPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await requireSession();

  const pool = await prisma.pool.findUnique({ where: { inviteCode: code } });
  if (!pool) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
        <h1 className="text-2xl font-bold">Convite inválido</h1>
        <p>Não encontramos um bolão com este código.</p>
      </main>
    );
  }

  // Ensure the viewer is a member (idempotent), then read the membership back.
  // Existing members short-circuit inside joinPool; a NEW member after the entry
  // deadline (contract §11.5) gets EntryClosedError — surface it instead of crashing.
  try {
    await joinPool({ inviteCode: code, userId: session.user.id });
  } catch (err) {
    if (err instanceof EntryClosedError) {
      return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
          <h1 className="text-2xl font-bold break-words">{pool.nome}</h1>
          <p
            role="alert"
            className="rounded-md bg-surface-muted p-3 text-sm text-danger"
          >
            As inscrições deste bolão já encerraram (1h antes do primeiro jogo).
          </p>
        </main>
      );
    }
    throw err;
  }
  const membership = await getMembership(pool.id, session.user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold break-words">{pool.nome}</h1>

      <p className="rounded-md bg-accent/10 p-3 text-sm font-semibold text-accent-strong">
        ✓ Você está dentro! Já pode fazer seus palpites.
      </p>

      {pool.valorEntrada > 0 ? (
        <>
          <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-soft p-4">
            <h2 className="text-lg font-semibold">Pagamento via PIX</h2>
            <p>
              Valor de entrada:{" "}
              <strong className="text-xl">{formatCentsBRL(pool.valorEntrada)}</strong>
            </p>
            <p className="break-all">
              Chave PIX: <strong>{pool.chavePix}</strong>
            </p>
            <div>
              <CopyButton text={pool.chavePix ?? ""} label="Copiar chave PIX" />
            </div>
            <p className="text-sm text-ink-strong">
              Pague o valor via PIX para o organizador e depois toque em
              &quot;Já paguei&quot;. O pagamento não trava seus palpites — dá
              para palpitar desde já.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            {membership?.paymentStatus === "pendente" ? (
              <form action={markPaidAction}>
                <input type="hidden" name="membershipId" value={membership.id} />
                <input type="hidden" name="code" value={code} />
                <SubmitButton pendingLabel="Registrando...">Já paguei</SubmitButton>
              </form>
            ) : membership?.paymentStatus === "pago" ? (
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
                ✓ Pagamento confirmado.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-ink-strong">
          Este bolão não tem valor de entrada — nada a pagar, só palpitar. 🎉
        </p>
      )}

      <a href={`/pools/${pool.id}/palpites`} className="text-accent-strong underline">
        Fazer meus palpites
      </a>
      <a href={`/pools/${pool.id}`} className="text-accent-strong underline">
        Ir para o bolão
      </a>
    </main>
  );
}
