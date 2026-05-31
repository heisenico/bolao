import { requireSession } from "@/lib/session";
import { Button } from "@/components/Button";
import { createPoolAction } from "./actions";

export default async function NewPoolPage() {
  // Owner-scoped: redirects unauthenticated users to /login.
  await requireSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Criar bolão</h1>
      <form action={createPoolAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Nome do bolão</span>
          <input
            name="nome"
            type="text"
            required
            placeholder="Bolão dos Amigos"
            className="rounded-md border border-borda px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Valor de entrada (R$)</span>
          <input
            name="valorEntrada"
            type="text"
            inputMode="decimal"
            required
            placeholder="25,00"
            className="rounded-md border border-borda px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Sua chave PIX</span>
          <input
            name="chavePix"
            type="text"
            required
            placeholder="email@pix ou telefone ou aleatória"
            className="rounded-md border border-borda px-3 py-2"
          />
        </label>

        <Button type="submit">Criar bolão</Button>
      </form>
    </main>
  );
}
