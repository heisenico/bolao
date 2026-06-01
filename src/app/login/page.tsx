import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/Button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) {
      throw new Error("E-mail é obrigatório");
    }
    await signIn("nodemailer", { email, redirectTo: "/dashboard" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Bolão da Copa 2026</h1>
        <p className="text-sm text-[#555555]">
          Entre com seu e-mail e enviaremos um link mágico de acesso.
        </p>
      </div>
      <form action={sendMagicLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="voce@exemplo.com"
          className="rounded-md border border-borda bg-fundo px-3 py-2 text-base outline-none focus:border-verde-acao"
        />
        <Button type="submit">Entrar com link mágico</Button>
      </form>
    </main>
  );
}
