import { requireSession } from "@/lib/session";
import { signOut } from "@/auth";
import { Button } from "@/components/Button";

export default async function DashboardPage() {
  const session = await requireSession();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm text-[#555555]">
        Você está logado como{" "}
        <span className="font-medium">{session.user?.email}</span>.
      </p>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          Sair
        </Button>
      </form>
    </main>
  );
}
