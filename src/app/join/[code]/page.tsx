import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EntryClosedError, joinPool, getMembership } from "@/server/pools";
import { formatCentsBRL } from "@/lib/money";
import { Button } from "@/components/Button";
import { AppNav } from "@/components/AppNav";
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
        <AppNav />
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
          <AppNav />
          <h1 className="text-2xl font-bold">{pool.nome}</h1>
          <p
            role="alert"
            className="rounded-md bg-fundo-secao p-3 text-sm text-perigo"
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
      <AppNav />
      <h1 className="text-2xl font-bold">{pool.nome}</h1>

      <section className="flex flex-col gap-2 rounded-md border border-borda bg-fundo-suave p-4">
        <h2 className="text-lg font-semibold">Pagamento via PIX</h2>
        <p>
          Valor de entrada: <strong>{formatCentsBRL(pool.valorEntrada)}</strong>
        </p>
        <p>
          Chave PIX: <strong className="break-all">{pool.chavePix}</strong>
        </p>
        <ol className="list-decimal pl-5 text-sm text-texto-suave">
          <li>Abra o app do seu banco e faça o PIX para a chave acima.</li>
          <li>Confira o valor de entrada.</li>
          <li>
            Depois de pagar, clique em &quot;Já paguei&quot; para avisar o
            organizador.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm">
          Status do pagamento:{" "}
          <strong>{membership?.paymentStatus ?? "pendente"}</strong>
        </p>
        {membership?.paymentStatus === "pendente" ? (
          <form action={markPaidAction}>
            <input type="hidden" name="membershipId" value={membership.id} />
            <input type="hidden" name="code" value={code} />
            <Button type="submit">Já paguei</Button>
          </form>
        ) : (
          <p className="text-sm text-verde-texto">
            Pagamento registrado. Aguarde a confirmação do organizador.
          </p>
        )}
      </section>

      <a href="/palpites" className="text-verde-texto underline">
        Ir para os palpites
      </a>
    </main>
  );
}
