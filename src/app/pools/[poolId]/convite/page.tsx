import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { inviteUrl } from "@/domain/share";
import { AppNav } from "@/components/AppNav";
import { CopyButton } from "@/components/CopyButton";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ShareInviteButton } from "@/components/ShareInviteButton";

/**
 * Invite screen: shown right after creating a bolão (the success moment) and
 * reachable any time later from the pool screen — the creator may need to
 * re-share until the Block A deadline. Owner-only: non-owners are sent to the
 * pool screen (the invite spreads via the owner).
 */
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const session = await requireSession();

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: { nome: true, ownerId: true, inviteCode: true },
  });
  if (!pool) redirect("/dashboard");
  if (pool.ownerId !== session.user.id) redirect(`/pools/${poolId}`);

  const join = inviteUrl(env.authUrl(), pool.inviteCode);
  const message = `Entra no meu bolão da Copa: ${pool.nome}! Código: ${pool.inviteCode}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav poolId={poolId} />
      <h1 className="text-2xl font-bold break-words">{pool.nome}</h1>

      <section className="flex flex-col items-center gap-4 rounded-md border border-border bg-surface-soft p-6 text-center">
        <p className="text-sm font-semibold text-ink-soft">
          Bolão criado! Chame o pessoal com este código:
        </p>
        <p
          data-invite-code
          className="select-all text-4xl font-bold tracking-[0.3em]"
          aria-label={`Código de convite: ${pool.inviteCode.split("").join(" ")}`}
        >
          {pool.inviteCode}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton text={pool.inviteCode} label="Copiar código" />
          <ShareInviteButton text={message} url={join} />
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Link de convite</h2>
        <p className="break-all text-sm text-ink-muted">{join}</p>
        <div>
          <CopyLinkButton url={join} />
        </div>
        <p className="text-xs text-ink-muted">
          As inscrições fecham 1h antes do jogo de abertura — depois disso
          ninguém mais entra.
        </p>
      </section>

      <a href={`/pools/${poolId}`} className="text-accent-strong underline">
        Ir para o bolão
      </a>
    </main>
  );
}
